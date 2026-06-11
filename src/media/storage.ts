import type { ServerResponse } from "node:http";
import { join, dirname, extname, isAbsolute } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import {
  readFile as readFileAsync,
  writeFile,
  unlink,
  mkdir,
  stat as statAsync,
} from "node:fs/promises";
import { z } from "zod";

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

export interface MediaStorage {
  /** Save a file buffer. Returns the storage key and public URL. */
  put(key: string, data: Buffer, mimeType: string): Promise<StoredFile>;
  /** Delete a file by key. */
  delete(key: string): Promise<void>;
  /** Return the public URL for a stored key. */
  url(key: string): string;
  /**
   * Serve a file to an HTTP response (local: pipe from disk; cloud: redirect).
   * Returns true if handled, false if not found.
   */
  serve(key: string, res: ServerResponse): Promise<boolean>;
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

  async serve(key: string, res: ServerResponse): Promise<boolean> {
    const filePath = join(this.dir, key);

    // Prevent directory traversal
    if (!filePath.startsWith(this.dir)) return false;

    try {
      const fileStat = await statAsync(filePath);
      if (!fileStat.isFile()) return false;
    } catch {
      return false;
    }

    const ext = extname(filePath).toLowerCase();
    const contentType = MIME[ext] || "application/octet-stream";
    const content = await readFileAsync(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
    return true;
  }
}

// --- Google Cloud Storage implementation ---

export class GcsMediaStorage implements MediaStorage {
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

  async serve(key: string, res: ServerResponse): Promise<boolean> {
    // For GCS, redirect to the public URL
    res.writeHead(302, { Location: this.url(key) });
    res.end();
    return true;
  }
}

// --- Amazon S3 (and S3-compatible) implementation ---

export class S3MediaStorage implements MediaStorage {
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

  async serve(key: string, res: ServerResponse): Promise<boolean> {
    // For S3-backed storage, redirect to the public URL.
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
