import type { ServerResponse } from "node:http";
import type { Readable } from "node:stream";
import { pipeline, finished } from "node:stream/promises";
import { join, dirname, extname, isAbsolute } from "node:path";
import {
  readFileSync,
  existsSync,
  createReadStream,
  createWriteStream,
} from "node:fs";
import {
  writeFile,
  unlink,
  mkdir,
  rename,
  rmdir,
  stat as statAsync,
} from "node:fs/promises";
import { z } from "zod";
import { parseRange } from "./range.js";

// --- MIME types (subset for media serving) ---

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
};

// --- Public types ---

export interface StoredFile {
  /** The storage key / filename (UUID-based). */
  key: string;
  /** The public URL to access the file. */
  url: string;
}

/** Request details {@link MediaStorage.serve} needs beyond the key. */
export interface ServeOptions {
  /** The request's `Range` header, if any. Honoured for a single byte range. */
  range?: string;
  /** `HEAD` writes headers only. Anything else is treated as GET. */
  method?: string;
}

export interface MediaStorage {
  /**
   * The most parts {@link assemble} can join into one object. Undefined means
   * no practical limit. Upload sessions refuse files that would need more.
   */
  readonly maxParts?: number;
  /** Save a file buffer. Returns the storage key and public URL. */
  put(key: string, data: Buffer, mimeType: string): Promise<StoredFile>;
  /**
   * Join `partKeys`, in order, into one object at `destKey`, then delete the
   * parts. The parts must already exist; nothing is written at `destKey` on
   * failure.
   */
  assemble(
    partKeys: readonly string[],
    destKey: string,
    mimeType: string,
  ): Promise<StoredFile>;
  /** Open a stored object for streaming reads, or null when it does not exist. */
  openRead(key: string): Promise<Readable | null>;
  /** Delete a file by key. */
  delete(key: string): Promise<void>;
  /** Return the public URL for a stored key. */
  url(key: string): string;
  /**
   * Serve a file to an HTTP response (local: stream from disk with byte-range
   * support; cloud: redirect to the bucket, which handles ranges itself).
   * Returns true if handled, false if not found.
   */
  serve(key: string, res: ServerResponse, options?: ServeOptions): Promise<boolean>;
}

// --- Local filesystem implementation ---

export class LocalMediaStorage implements MediaStorage {
  private dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  async put(key: string, data: Buffer, _mimeType: string): Promise<StoredFile> {
    const filePath = join(this.dir, key);
    // Keys may contain "/" (e.g. per-tenant prefixes); ensure the parent exists.
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
    return { key, url: this.url(key) };
  }

  async delete(key: string): Promise<void> {
    const filePath = join(this.dir, key);
    try {
      await unlink(filePath);
    } catch (err: unknown) {
      // Ignore if file already removed
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  url(key: string): string {
    return `/media/${key}`;
  }

  async assemble(
    partKeys: readonly string[],
    destKey: string,
    _mimeType: string,
  ): Promise<StoredFile> {
    const destPath = join(this.dir, destKey);
    const partialPath = `${destPath}.partial`;
    await mkdir(dirname(destPath), { recursive: true });

    // Assemble beside the destination and rename into place, so a failure
    // midway never leaves a truncated file at the public key.
    const out = createWriteStream(partialPath);
    try {
      for (const partKey of partKeys) {
        await pipeline(createReadStream(join(this.dir, partKey)), out, { end: false });
      }
      out.end();
      await finished(out);
    } catch (err) {
      out.destroy();
      await unlink(partialPath).catch(() => {});
      throw err;
    }

    await rename(partialPath, destPath);
    await Promise.all(partKeys.map((k) => this.delete(k)));
    // Parts usually share a per-upload folder that is now empty. Object stores
    // have no folders to leave behind; a filesystem would keep one per upload.
    // `rmdir` only removes empty directories, so a shared one survives.
    const partDirs = new Set(partKeys.map((k) => dirname(join(this.dir, k))));
    partDirs.delete(this.dir);
    await Promise.all([...partDirs].map((d) => rmdir(d).catch(() => {})));
    return { key: destKey, url: this.url(destKey) };
  }

  async openRead(key: string): Promise<Readable | null> {
    const filePath = await this.existingFile(key);
    return filePath ? createReadStream(filePath) : null;
  }

  async serve(
    key: string,
    res: ServerResponse,
    options: ServeOptions = {},
  ): Promise<boolean> {
    const filePath = await this.existingFile(key);
    if (!filePath) return false;
    const { size } = await statAsync(filePath);

    const ext = extname(filePath).toLowerCase();
    const headers: Record<string, string> = {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Accept-Ranges": "bytes",
    };

    const range = parseRange(options.range, size);
    if (range === "unsatisfiable") {
      res.writeHead(416, { ...headers, "Content-Range": `bytes */${size}` });
      res.end();
      return true;
    }

    if (range) {
      headers["Content-Range"] = `bytes ${range.start}-${range.end}/${size}`;
    }
    const start = range?.start ?? 0;
    const end = range?.end ?? size - 1;
    headers["Content-Length"] = String(size === 0 ? 0 : end - start + 1);
    res.writeHead(range ? 206 : 200, headers);

    if (options.method === "HEAD" || size === 0) {
      res.end();
      return true;
    }

    // Streamed, never buffered: an episode can be hundreds of megabytes. A
    // listener closing the tab mid-stream rejects the pipeline; that is not a
    // server error, and the response is already torn down by then.
    await pipeline(createReadStream(filePath, { start, end }), res).catch(() => {});
    return true;
  }

  /** Resolve `key` to a regular file inside the media directory, or null. */
  private async existingFile(key: string): Promise<string | null> {
    const filePath = join(this.dir, key);

    // Prevent directory traversal
    if (!filePath.startsWith(this.dir)) return null;

    try {
      const fileStat = await statAsync(filePath);
      return fileStat.isFile() ? filePath : null;
    } catch {
      return null;
    }
  }
}

// --- Google Cloud Storage implementation ---

export class GcsMediaStorage implements MediaStorage {
  /** GCS `compose` accepts at most 32 source objects. */
  readonly maxParts = 32;
  private bucket: string;
  private publicUrl: string;
  private keyFile?: string;
  private storageClient: unknown | null = null;

  constructor(options: {
    bucket: string;
    keyFile?: string;
    publicUrl?: string;
  }) {
    this.bucket = options.bucket;
    this.keyFile = options.keyFile;
    this.publicUrl =
      options.publicUrl ||
      `https://storage.googleapis.com/${options.bucket}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getClient(): Promise<any> {
    if (this.storageClient) return this.storageClient;

    // Dynamic import — @google-cloud/storage is only needed when GCS backend is active.
    // The module name is constructed at runtime to avoid TypeScript module resolution errors
    // when the optional dependency is not installed.
    const moduleName = "@google-cloud/" + "storage";
    const mod = await import(/* webpackIgnore: true */ moduleName);
    const Storage = mod.Storage;
    this.storageClient = this.keyFile
      ? new Storage({ keyFilename: this.keyFile })
      : new Storage();
    return this.storageClient;
  }

  async put(key: string, data: Buffer, mimeType: string): Promise<StoredFile> {
    const client = await this.getClient();
    const file = client.bucket(this.bucket).file(key);
    await file.save(data, { contentType: mimeType });
    return { key, url: this.url(key) };
  }

  async delete(key: string): Promise<void> {
    try {
      const client = await this.getClient();
      const file = client.bucket(this.bucket).file(key);
      await file.delete();
    } catch {
      // Ignore not-found errors
    }
  }

  url(key: string): string {
    return `${this.publicUrl}/${key}`;
  }

  async assemble(
    partKeys: readonly string[],
    destKey: string,
    mimeType: string,
  ): Promise<StoredFile> {
    const client = await this.getClient();
    const bucket = client.bucket(this.bucket);
    const dest = bucket.file(destKey);
    // `combine` sends the destination's metadata.contentType; without it GCS
    // guesses from the extension, which is not what the bytes were checked as.
    dest.metadata = { ...dest.metadata, contentType: mimeType };
    await bucket.combine([...partKeys], dest, { deleteSourceObjects: true });
    return { key: destKey, url: this.url(destKey) };
  }

  async openRead(key: string): Promise<Readable | null> {
    const client = await this.getClient();
    const file = client.bucket(this.bucket).file(key);
    const [exists] = await file.exists();
    return exists ? (file.createReadStream() as Readable) : null;
  }

  async serve(key: string, res: ServerResponse): Promise<boolean> {
    // For GCS, redirect to the public URL. GCS answers Range requests itself.
    res.writeHead(302, { Location: this.url(key) });
    res.end();
    return true;
  }
}

// --- Amazon S3 (and S3-compatible) implementation ---

export class S3MediaStorage implements MediaStorage {
  /** S3 multipart uploads accept up to 10,000 parts. */
  readonly maxParts = 10_000;
  private bucket: string;
  private region?: string;
  private endpoint?: string;
  private forcePathStyle?: boolean;
  private accessKeyId?: string;
  private secretAccessKey?: string;
  private publicUrl?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sdk: any | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any | null = null;

  constructor(options: {
    bucket: string;
    region?: string;
    endpoint?: string;
    forcePathStyle?: boolean;
    accessKeyId?: string;
    secretAccessKey?: string;
    publicUrl?: string;
  }) {
    this.bucket = options.bucket;
    this.region = options.region;
    this.endpoint = options.endpoint;
    this.forcePathStyle = options.forcePathStyle;
    this.accessKeyId = options.accessKeyId;
    this.secretAccessKey = options.secretAccessKey;
    this.publicUrl = options.publicUrl;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getClient(): Promise<any> {
    if (this.client) return this.client;

    // Dynamic import — @aws-sdk/client-s3 is only needed when the S3 backend is
    // active. The module name is constructed at runtime so the optional
    // dependency does not break builds when it is not installed.
    const moduleName = "@aws-sdk/" + "client-s3";
    this.sdk = await import(/* webpackIgnore: true */ moduleName);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: Record<string, any> = {};
    if (this.region) config.region = this.region;
    if (this.endpoint) {
      config.endpoint = this.endpoint;
      // Custom endpoints (R2, MinIO, Spaces, ...) generally need path-style URLs.
      config.forcePathStyle = this.forcePathStyle ?? true;
    } else if (this.forcePathStyle !== undefined) {
      config.forcePathStyle = this.forcePathStyle;
    }
    if (this.accessKeyId && this.secretAccessKey) {
      config.credentials = {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
      };
    }

    this.client = new this.sdk.S3Client(config);
    return this.client;
  }

  async put(key: string, data: Buffer, mimeType: string): Promise<StoredFile> {
    const client = await this.getClient();
    await client.send(
      new this.sdk.PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: mimeType,
      }),
    );
    return { key, url: this.url(key) };
  }

  async delete(key: string): Promise<void> {
    try {
      const client = await this.getClient();
      await client.send(
        new this.sdk.DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch {
      // Ignore not-found errors
    }
  }

  url(key: string): string {
    if (this.publicUrl) return `${this.publicUrl}/${key}`;
    if (this.endpoint) {
      return `${this.endpoint.replace(/\/$/, "")}/${this.bucket}/${key}`;
    }
    const region = this.region || "us-east-1";
    return `https://${this.bucket}.s3.${region}.amazonaws.com/${key}`;
  }

  async assemble(
    partKeys: readonly string[],
    destKey: string,
    mimeType: string,
  ): Promise<StoredFile> {
    const client = await this.getClient();
    const { UploadId } = await client.send(
      new this.sdk.CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: destKey,
        ContentType: mimeType,
      }),
    );

    // Server-side copy of each stored part into the multipart upload: the
    // bytes never pass back through this process. S3's 5 MiB minimum part
    // size (all but the last) is met by the upload chunk size.
    try {
      const parts: { PartNumber: number; ETag?: string }[] = [];
      for (const [i, partKey] of partKeys.entries()) {
        const out = await client.send(
          new this.sdk.UploadPartCopyCommand({
            Bucket: this.bucket,
            Key: destKey,
            UploadId,
            PartNumber: i + 1,
            CopySource: `${this.bucket}/${encodeURIComponent(partKey)}`,
          }),
        );
        parts.push({ PartNumber: i + 1, ETag: out.CopyPartResult?.ETag });
      }
      await client.send(
        new this.sdk.CompleteMultipartUploadCommand({
          Bucket: this.bucket,
          Key: destKey,
          UploadId,
          MultipartUpload: { Parts: parts },
        }),
      );
    } catch (err) {
      await client
        .send(
          new this.sdk.AbortMultipartUploadCommand({
            Bucket: this.bucket,
            Key: destKey,
            UploadId,
          }),
        )
        .catch(() => {});
      throw err;
    }

    await Promise.all(partKeys.map((k) => this.delete(k)));
    return { key: destKey, url: this.url(destKey) };
  }

  async openRead(key: string): Promise<Readable | null> {
    const client = await this.getClient();
    try {
      const out = await client.send(
        new this.sdk.GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return out.Body as Readable;
    } catch (err) {
      // SDK v3 throws a `NoSuchKey` error class for a missing object.
      if (err instanceof Error && err.name === "NoSuchKey") return null;
      throw err;
    }
  }

  async serve(key: string, res: ServerResponse): Promise<boolean> {
    // For S3-backed storage, redirect to the public URL. S3 answers Range
    // requests itself.
    res.writeHead(302, { Location: this.url(key) });
    res.end();
    return true;
  }
}

// --- Configuration ---

const localStorageConfigSchema = z.object({
  backend: z.literal("local"),
  /** Directory for uploads. Relative paths resolve from the working directory. */
  dir: z.string().optional(),
});

const gcsStorageConfigSchema = z.object({
  backend: z.literal("gcs"),
  bucket: z.string().min(1, "bucket is required for the gcs backend"),
  keyFile: z.string().optional(),
  publicUrl: z.string().optional(),
});

const s3StorageConfigSchema = z.object({
  backend: z.literal("s3"),
  bucket: z.string().min(1, "bucket is required for the s3 backend"),
  region: z.string().optional(),
  /** Custom endpoint for S3-compatible providers (R2, MinIO, Spaces, ...). */
  endpoint: z.string().optional(),
  forcePathStyle: z.boolean().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  publicUrl: z.string().optional(),
});

export const storageConfigSchema = z.discriminatedUnion("backend", [
  localStorageConfigSchema,
  gcsStorageConfigSchema,
  s3StorageConfigSchema,
]);

export type StorageConfig = z.infer<typeof storageConfigSchema>;

/** Default path (relative to cwd) where the storage config file is looked up. */
export const DEFAULT_STORAGE_CONFIG_PATH = join(
  "config",
  "storage.config.json",
);

/**
 * Load and validate the storage configuration from disk.
 *
 * Looks at `STORAGE_CONFIG` (if set) or `config/storage.config.json` relative to
 * the current working directory. When no file is present, falls back to the
 * local filesystem backend.
 */
export function loadStorageConfig(): StorageConfig {
  const configPath =
    process.env.STORAGE_CONFIG ||
    join(process.cwd(), DEFAULT_STORAGE_CONFIG_PATH);

  if (!existsSync(configPath)) {
    return { backend: "local" };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (err) {
    throw new Error(
      `Failed to parse storage config at ${configPath}: ${(err as Error).message}`,
    );
  }

  const result = storageConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Invalid storage config at ${configPath}: ${result.error.message}`,
    );
  }
  return result.data;
}

// --- Factory ---

/**
 * Build a {@link MediaStorage} from an explicit config or the on-disk
 * `config/storage.config.json`. With no config the local filesystem is used.
 */
export function createMediaStorage(config?: StorageConfig): MediaStorage {
  const cfg = config ?? loadStorageConfig();

  switch (cfg.backend) {
    case "gcs":
      return new GcsMediaStorage({
        bucket: cfg.bucket,
        keyFile: cfg.keyFile,
        publicUrl: cfg.publicUrl,
      });
    case "s3":
      return new S3MediaStorage({
        bucket: cfg.bucket,
        region: cfg.region,
        endpoint: cfg.endpoint,
        forcePathStyle: cfg.forcePathStyle,
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
        publicUrl: cfg.publicUrl,
      });
    case "local":
    default: {
      const configuredDir = cfg.backend === "local" ? cfg.dir : undefined;
      const dir = configuredDir
        ? isAbsolute(configuredDir)
          ? configuredDir
          : join(process.cwd(), configuredDir)
        : join(process.cwd(), "media");
      return new LocalMediaStorage(dir);
    }
  }
}
