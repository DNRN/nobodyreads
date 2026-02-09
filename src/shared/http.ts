import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile as readFileAsync, stat as statAsync } from "node:fs/promises";
import { join, extname } from "node:path";

// --- MIME types ---

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

// --- HTML utilities ---

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// --- Response helpers ---

export interface HtmlOptions {
  noAiTraining?: boolean;
}

export function html(
  res: ServerResponse,
  body: string,
  status = 200,
  options?: HtmlOptions
): void {
  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8",
  };
  if (options?.noAiTraining) {
    headers["X-Robots-Tag"] = "noai, noimageai";
  }
  res.writeHead(status, headers);
  res.end(body);
}

export function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

export function redirect(res: ServerResponse, location: string, status = 302): void {
  res.writeHead(status, { Location: location });
  res.end();
}

// --- Static file serving ---

export async function serveStatic(
  res: ServerResponse,
  pathname: string,
  publicDir: string
): Promise<boolean> {
  const filePath = join(publicDir, pathname);

  // Prevent directory traversal
  if (!filePath.startsWith(publicDir)) return false;

  try {
    const fileStat = await statAsync(filePath);
    if (!fileStat.isFile()) return false;
  } catch {
    return false;
  }

  const ext = extname(filePath);
  const contentType = MIME[ext] || "application/octet-stream";
  const content = await readFileAsync(filePath);
  res.writeHead(200, { "Content-Type": contentType });
  res.end(content);
  return true;
}

// --- Form body parsing ---

export function parseFormBody(
  req: IncomingMessage
): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf-8");
      const params = new URLSearchParams(body);
      const result: Record<string, string> = {};
      for (const [key, value] of params) {
        result[key] = value;
      }
      resolve(result);
    });
    req.on("error", reject);
  });
}
