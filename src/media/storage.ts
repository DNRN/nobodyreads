import type { ServerResponse } from "node:http";
import { join, extname } from "node:path";
import {
  readFile as readFileAsync,
  writeFile,
  unlink,
  mkdir,
  stat as statAsync,
} from "node:fs/promises";

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
    await mkdir(this.dir, { recursive: true });
    const filePath = join(this.dir, key);
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
  private storageClient: unknown | null = null;

  constructor(options: {
    bucket: string;
    keyFile?: string;
    publicUrl?: string;
  }) {
    this.bucket = options.bucket;
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
    const keyFile = process.env.GCS_KEY_FILE;
    this.storageClient = keyFile ? new Storage({ keyFilename: keyFile }) : new Storage();
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

// --- Factory ---

export function createMediaStorage(): MediaStorage {
  const backend = (process.env.MEDIA_STORAGE || "local").toLowerCase();

  if (backend === "gcs") {
    const bucket = process.env.GCS_BUCKET;
    if (!bucket) {
      throw new Error("GCS_BUCKET environment variable is required when MEDIA_STORAGE=gcs");
    }
    return new GcsMediaStorage({
      bucket,
      keyFile: process.env.GCS_KEY_FILE,
      publicUrl: process.env.GCS_PUBLIC_URL,
    });
  }

  // Default: local filesystem
  const dir = process.env.MEDIA_DIR || join(process.cwd(), "media");
  return new LocalMediaStorage(dir);
}
