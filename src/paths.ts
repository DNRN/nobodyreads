import { join } from "node:path";

/** Get the absolute path to the package's public/ directory (for static file serving). */
export function getPublicDir(): string {
  return join(import.meta.dirname, "..", "public");
}

/** Get the absolute path to the package's schema.sql file. */
export function getSchemaPath(): string {
  return join(import.meta.dirname, "..", "schema.sql");
}

/** Get the absolute path to the package's robots.txt file. */
export function getRobotsTxtPath(): string {
  return join(import.meta.dirname, "..", "robots.txt");
}
