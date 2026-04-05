import "dotenv/config";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { readFile as readFileAsync, stat as statAsync } from "node:fs/promises";
import { watch } from "node:fs";
import { join, extname } from "node:path";
import { connect } from "node:net";
import { pathToFileURL } from "node:url";
import { EventEmitter } from "node:events";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { streamSSE } from "hono/streaming";
import { initDb } from "./shared/db.js";
import { createMediaStorage, type LocalMediaStorage } from "./media/storage.js";
import { createBlogApiRoutes } from "./content/index.js";
import { createEditorRoutes } from "./admin/server/routes.js";
import {
  createSubscriptionApiRoutes,
  createSubscriptionAdminRoutes,
} from "./subscription/index.js";
import {
  editorRequiresAuth,
  isAuthenticatedRequest,
} from "./admin/server/auth.js";

const PORT = parseInt(process.env.PORT || "3000", 10);
const IS_DEV = process.env.NODE_ENV !== "production";
const PUBLIC_DIR = join(import.meta.dirname, "..", "public");
const ROBOTS_TXT_PATH = join(import.meta.dirname, "..", "robots.txt");
const ASTRO_DEV_URL = process.env.ASTRO_DEV_URL || "http://localhost:4321";
const ASTRO_DEV_PROXY = process.env.ASTRO_DEV_PROXY !== "0";
const ASTRO_ENTRY_PATH = join(
  import.meta.dirname,
  "..",
  "dist",
  "astro",
  "server",
  "entry.mjs"
);

/**
 * Sentinel response that tells @hono/node-server the raw Node response
 * was already written to directly (e.g. by Astro SSR or media storage).
 */
function alreadySent(): Response {
  return new Response(null, {
    headers: { "x-hono-already-sent": "1" },
  });
}

// --- MIME types for static file serving ---

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
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
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

// --- Astro SSR handler (production) ---

let astroHandler:
  | ((req: IncomingMessage, res: ServerResponse) => Promise<void>)
  | null = null;

async function getAstroHandler(): Promise<
  ((req: IncomingMessage, res: ServerResponse) => Promise<void>) | null
> {
  if (astroHandler) return astroHandler;
  try {
    const moduleUrl = pathToFileURL(ASTRO_ENTRY_PATH).href;
    const mod = await import(moduleUrl);
    if (typeof mod.handler === "function") {
      astroHandler = mod.handler;
      return astroHandler;
    }
  } catch (err) {
    console.warn("astro SSR handler unavailable:", err);
  }
  return null;
}

// --- Live-reload (dev only) ---

const reloadEmitter = new EventEmitter();

function initLiveReload(): void {
  if (!IS_DEV) return;
  const dirs = [PUBLIC_DIR, import.meta.dirname];
  for (const dir of dirs) {
    watch(dir, { recursive: true }, () => {
      reloadEmitter.emit("reload");
    });
  }
  console.log("live-reload watching public/ and src/");
}

// --- Start ---

async function start() {
  const db = await initDb();
  initLiveReload();

  const storage = createMediaStorage();
  if (
    "init" in storage &&
    typeof (storage as LocalMediaStorage).init === "function"
  ) {
    await (storage as LocalMediaStorage).init();
  }

  const app = new Hono();

  // ---- Global error handler ----
  app.onError((err, c) => {
    console.error("request error:", err);
    return c.html("<h1>500 Internal Server Error</h1>", 500);
  });

  // ---- Dev-only: SSE live-reload ----
  if (IS_DEV) {
    app.get("/__reload", (c) => {
      return streamSSE(c, async (stream) => {
        await stream.writeSSE({ data: "connected" });

        const onReload = async () => {
          try {
            await stream.writeSSE({ data: "reload" });
          } catch {
            /* stream closed */
          }
        };

        reloadEmitter.on("reload", onReload);

        await new Promise<void>((resolve) => {
          stream.onAbort(() => {
            reloadEmitter.off("reload", onReload);
            resolve();
          });
        });
      });
    });
  }

  // ---- robots.txt ----
  app.get("/robots.txt", async (c) => {
    try {
      const content = await readFileAsync(ROBOTS_TXT_PATH, "utf-8");
      return c.text(content);
    } catch {
      return c.text("Not found", 404);
    }
  });

  // ---- Static files from public/ ----
  app.use("*", async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") return next();

    const pathname = new URL(c.req.url).pathname;
    const filePath = join(PUBLIC_DIR, pathname);
    if (!filePath.startsWith(PUBLIC_DIR)) return next();

    try {
      const fileStat = await statAsync(filePath);
      if (!fileStat.isFile()) return next();

      const content = await readFileAsync(filePath);
      const ext = extname(filePath);
      const contentType = MIME[ext] || "application/octet-stream";
      return c.body(content, 200, { "Content-Type": contentType });
    } catch {
      return next();
    }
  });

  // ---- Media files ----
  app.get("/media/:key{.+}", async (c) => {
    const key = decodeURIComponent(c.req.param("key"));
    const nodeRes = (c.env as Record<string, unknown>)
      .outgoing as ServerResponse;
    const served = await storage.serve(key, nodeRes);
    if (served) return alreadySent();
    return c.text("Not found", 404);
  });

  // ---- Public API: blog + subscriptions ----
  app.route("/api", createBlogApiRoutes({ db }));
  app.route("/api", createSubscriptionApiRoutes({ db }));

  // ---- Admin auth middleware ----
  app.use("/admin/*", async (c, next) => {
    const pathname = new URL(c.req.url).pathname;
    if (pathname === "/admin/login" || pathname === "/admin/logout") {
      return next();
    }
    if (!editorRequiresAuth()) return next();
    if (!isAuthenticatedRequest(c.req.raw)) {
      return c.redirect("/admin/login");
    }
    return next();
  });

  // ---- Admin routes ----
  app.route("/admin", createEditorRoutes({ db, storage }));
  app.route("/admin", createSubscriptionAdminRoutes({ db }));

  // ---- Catchall: Astro SSR or dev proxy ----
  app.all("*", async (c) => {
    if (IS_DEV && ASTRO_DEV_PROXY) {
      try {
        const url = new URL(c.req.url);
        const targetUrl = new URL(url.pathname + url.search, ASTRO_DEV_URL);

        const proxyHeaders = new Headers(c.req.raw.headers);
        proxyHeaders.delete("host");
        proxyHeaders.delete("connection");

        const proxyRes = await fetch(targetUrl, {
          method: c.req.method,
          headers: proxyHeaders,
          body:
            c.req.method !== "GET" && c.req.method !== "HEAD"
              ? c.req.raw.body
              : undefined,
          redirect: "manual",
          duplex: "half",
        } as RequestInit);

        const headers = new Headers();
        proxyRes.headers.forEach((value, key) => {
          headers.append(key, value);
        });

        // Preserve multiple Set-Cookie headers
        const setCookies = (
          proxyRes.headers as unknown as {
            getSetCookie?: () => string[];
          }
        ).getSetCookie?.();
        if (setCookies && setCookies.length > 0) {
          headers.delete("set-cookie");
          for (const cookie of setCookies) {
            headers.append("set-cookie", cookie);
          }
        }

        return new Response(proxyRes.body, {
          status: proxyRes.status,
          headers,
        });
      } catch (err) {
        const cause = err instanceof Error ? (err.cause as Record<string, unknown>) : null;
        const reason =
          cause && typeof cause.code === "string"
            ? cause.code
            : err instanceof Error
              ? err.message
              : String(err);
        console.warn(`astro dev proxy failed: ${reason}`);
        return c.html(
          `<html><body style="font-family:system-ui;max-width:480px;margin:80px auto;text-align:center">` +
            `<h2>Astro dev server not reachable</h2>` +
            `<p style="color:#888">Run <code>npm run dev:astro</code> in a separate terminal.</p>` +
            `<p style="color:#aaa;font-size:0.85rem">${reason}</p></body></html>`,
          502
        );
      }
    }

    // Production: Astro SSR
    const handler = await getAstroHandler();
    if (handler) {
      const nodeReq = (c.env as Record<string, unknown>)
        .incoming as IncomingMessage;
      const nodeRes = (c.env as Record<string, unknown>)
        .outgoing as ServerResponse;
      await handler(nodeReq, nodeRes);
      if (!nodeRes.writableEnded) {
        await new Promise<void>((resolve) => nodeRes.on("finish", resolve));
      }
      return alreadySent();
    }

    return c.text("Not found", 404);
  });

  // ---- Start server ----
  const server = serve(
    { fetch: app.fetch, port: PORT, hostname: "0.0.0.0" },
    () => {
      console.log(`nobodyreads server running at http://0.0.0.0:${PORT}`);
      if (IS_DEV) console.log("dev mode \u2014 live-reload enabled");
    }
  );

  // WebSocket upgrade proxy for Astro dev HMR
  if (IS_DEV && ASTRO_DEV_PROXY) {
    server.on(
      "upgrade",
      (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        try {
          const target = new URL(ASTRO_DEV_URL);
          const port = target.port
            ? parseInt(target.port, 10)
            : target.protocol === "https:"
              ? 443
              : 80;

          const proxySocket = connect(port, target.hostname, () => {
            const headers = Object.entries(req.headers)
              .map(([key, value]) => {
                if (!value) return "";
                const headerValue = Array.isArray(value)
                  ? value.join(",")
                  : value;
                return `${key}: ${headerValue}`;
              })
              .filter(Boolean)
              .join("\r\n");

            proxySocket.write(
              `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${headers}\r\n\r\n`
            );
            if (head.length > 0) {
              proxySocket.write(head);
            }
            socket.pipe(proxySocket).pipe(socket);
          });

          proxySocket.on("error", () => socket.destroy());
        } catch {
          socket.destroy();
        }
      }
    );
  }
}

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
