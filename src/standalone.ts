import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile as readFileAsync } from "node:fs/promises";
import { watch } from "node:fs";
import { join } from "node:path";
import { connect } from "node:net";
import { pathToFileURL } from "node:url";
import { initDb } from "./shared/db.js";
import { serveStatic } from "./shared/http.js";
import { createBlogRouter, type RequestHandler } from "./content/index.js";
import { createEditorRouter } from "./editor/index.js";

const PORT = parseInt(process.env.PORT || "3000", 10);
const IS_DEV = process.env.NODE_ENV !== "production";
const PUBLIC_DIR = join(import.meta.dirname, "..", "public");
const ROBOTS_TXT_PATH = join(import.meta.dirname, "..", "robots.txt");
const ASTRO_DEV_URL = process.env.ASTRO_DEV_URL || "http://localhost:4321";
const ASTRO_DEV_PROXY = process.env.ASTRO_DEV_PROXY !== "0";
const ASTRO_ENTRY_PATH = join(import.meta.dirname, "..", "dist", "astro", "server", "entry.mjs");

let astroHandler: ((req: IncomingMessage, res: ServerResponse) => Promise<void>) | null = null;

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

function copyProxyHeaders(headers: IncomingMessage["headers"]): Headers {
  const proxyHeaders = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (!value) continue;
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "connection" || lower === "content-length") continue;
    if (Array.isArray(value)) {
      proxyHeaders.set(key, value.join(","));
    } else {
      proxyHeaders.set(key, value);
    }
  }
  return proxyHeaders;
}

async function proxyToAstroDev(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  if (!ASTRO_DEV_PROXY) return false;
  try {
    const targetUrl = new URL(req.url || "/", ASTRO_DEV_URL);
    const method = req.method || "GET";
    const proxyRes = await fetch(targetUrl, {
      method,
      headers: copyProxyHeaders(req.headers),
      body: method === "GET" || method === "HEAD" ? undefined : req,
      redirect: "manual",
    });

    res.statusCode = proxyRes.status;
    proxyRes.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    const setCookie = (proxyRes.headers as unknown as { getSetCookie?: () => string[] })
      .getSetCookie?.();
    if (setCookie && setCookie.length > 0) {
      res.setHeader("set-cookie", setCookie);
    }
    const buffer = Buffer.from(await proxyRes.arrayBuffer());
    res.end(buffer);
    return true;
  } catch (err) {
    console.warn("astro dev proxy failed:", err);
    return false;
  }
}

// --- SSE live-reload (dev only) ---

const sseClients = new Set<ServerResponse>();

function initLiveReload(): void {
  if (!IS_DEV) return;

  const dirs = [PUBLIC_DIR, import.meta.dirname];

  for (const dir of dirs) {
    watch(dir, { recursive: true }, () => {
      for (const client of sseClients) {
        client.write("data: reload\n\n");
      }
    });
  }

  console.log("live-reload watching public/ and src/");
}

function handleSSE(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("data: connected\n\n");
  sseClients.add(res);
  res.on("close", () => sseClients.delete(res));
}

// --- Start ---

async function start() {
  const db = await initDb();
  initLiveReload();

  const editorHandler = createEditorRouter({ db });
  const blogHandler: RequestHandler = createBlogRouter({ db });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const { pathname } = url;

    try {
      // SSE live-reload (dev only)
      if (IS_DEV && pathname === "/__reload") {
        return handleSSE(req, res);
      }

      // robots.txt
      if (pathname === "/robots.txt" && req.method === "GET") {
        try {
          const robotsTxt = await readFileAsync(ROBOTS_TXT_PATH, "utf-8");
          res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
          return res.end(robotsTxt);
        } catch {
          res.writeHead(404);
          return res.end("Not found");
        }
      }

      // Static files
      const served = await serveStatic(res, pathname, PUBLIC_DIR);
      if (served) return;

      // Editor routes
      if (pathname.startsWith("/admin")) {
        return editorHandler(req, res, pathname);
      }

      // Blog API routes (keep existing handler)
      if (pathname.startsWith("/api")) {
        return blogHandler(req, res, pathname);
      }

      // Astro pages (dev proxy or SSR build)
      if (IS_DEV) {
        const proxied = await proxyToAstroDev(req, res);
        if (proxied) return;
      } else {
        const handler = await getAstroHandler();
        if (handler) {
          await handler(req, res);
          return;
        }
      }

      // Fallback blog routes (legacy templates)
      await blogHandler(req, res, pathname);
    } catch (err) {
      console.error("request error:", err);
      res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h1>500 Internal Server Error</h1>");
    }
  });

  server.on("upgrade", (req, socket, head) => {
    if (!IS_DEV || !ASTRO_DEV_PROXY) {
      socket.destroy();
      return;
    }

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
            const headerValue = Array.isArray(value) ? value.join(",") : value;
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
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`nobodyreads server running at http://0.0.0.0:${PORT}`);
    if (IS_DEV) console.log("dev mode \u2014 live-reload enabled");
  });
}

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
