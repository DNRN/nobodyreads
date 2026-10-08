import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { z } from "zod";
import { insertMedia } from "../../../content/db.js";
import type { MediaStorage } from "../../../media/storage.js";
import { normalizeAudioMime, probeAudio } from "../../../media/upload/audio.js";
import {
  DEFAULT_MAX_UPLOAD_BYTES,
  UPLOAD_CHUNK_BYTES,
  UPLOAD_SESSION_TTL_SECONDS,
  claimSession,
  countReceivedParts,
  createUploadSession,
  deleteSessionRows,
  discardSession,
  getOpenSession,
  partCount,
  partKey,
  recordPart,
  releaseSession,
  discardUploadSessions,
} from "../../../media/upload/session.js";
import { fireMediaUploaded, type AdminModuleContext } from "./types.js";

const createSessionSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string(),
  size: z.number().int().positive(),
});

/**
 * Chunked uploads for files too large for one request (see
 * `docs/adr/0001-chunked-uploads-through-the-app.md`):
 *
 *   POST   /media/upload-session                 { filename, mimeType, size }
 *   PUT    /media/upload-session/:id/parts/:n    raw bytes, exactly the part's size
 *   POST   /media/upload-session/:id/complete    → the new media item
 *   DELETE /media/upload-session/:id             abort
 *
 * Parts are numbered from 0. Every part but the last is `chunkBytes` long.
 * Re-sending a part is safe, so a client retries a failed PUT by sending it
 * again. Nothing reaches the media library until `complete` has checked the
 * bytes against what was declared.
 *
 * Audio only for now; the accepted set grows with the content types that need
 * large files.
 */
export function createUploadSessionRoutes(ctx: AdminModuleContext): Hono {
  const { db, storage, tenantId } = ctx;
  const keyPrefix = ctx.keyPrefix ?? "";
  const maxUploadBytes = ctx.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
  const app = new Hono();

  if (!storage) return app;

  app.post("/media/upload-session", async (c) => {
    const parsed = createSessionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Expected { filename, mimeType, size }" }, 400);
    }
    const { filename, mimeType, size } = parsed.data;

    const type = normalizeAudioMime(mimeType);
    if (!type) {
      return c.json({ error: `Unsupported file type: ${mimeType}. Upload mp3, m4a, ogg or wav.` }, 415);
    }
    if (size > maxUploadBytes) {
      return c.json({ error: `File is larger than the ${maxUploadBytes}-byte limit`, maxUploadBytes }, 413);
    }
    const parts = Math.ceil(size / UPLOAD_CHUNK_BYTES);
    if (storage.maxParts !== undefined && parts > storage.maxParts) {
      const ceiling = storage.maxParts * UPLOAD_CHUNK_BYTES;
      return c.json({ error: `This storage backend cannot hold files over ${ceiling} bytes` }, 413);
    }

    const now = Math.floor(Date.now() / 1000);
    // Opportunistic cleanup; a failure here must not block a new upload.
    await discardUploadSessions(db, storage, keyPrefix, tenantId, {
      createdBefore: now - UPLOAD_SESSION_TTL_SECONDS,
    }).catch((err) => console.error("upload session sweep failed:", err));

    const session = await createUploadSession(db, {
      tenantId,
      originalName: filename,
      mimeType: type.mimeType,
      size,
      now,
    });
    return c.json(
      { sessionId: session.sessionId, chunkBytes: session.chunkBytes, partCount: parts },
      201,
    );
  });

  app.put(
    "/media/upload-session/:id/parts/:n",
    // Reject an oversized body while it streams in, not after buffering it.
    bodyLimit({
      maxSize: UPLOAD_CHUNK_BYTES,
      onError: (c) => c.json({ error: `A part may not exceed ${UPLOAD_CHUNK_BYTES} bytes` }, 413),
    }),
    async (c) => {
      const session = await getOpenSession(db, tenantId, c.req.param("id"));
      if (!session) return c.json({ error: "No open upload session" }, 404);

      const n = Number(c.req.param("n"));
      const total = partCount(session);
      if (!Number.isInteger(n) || n < 0 || n >= total) {
        return c.json({ error: `Part number must be 0–${total - 1}` }, 400);
      }

      const expected =
        n < total - 1 ? session.chunkBytes : session.size - (total - 1) * session.chunkBytes;
      const data = Buffer.from(await c.req.arrayBuffer());
      if (data.length !== expected) {
        return c.json(
          { error: `Part ${n} must be exactly ${expected} bytes, got ${data.length}` },
          400,
        );
      }

      await storage.put(partKey(keyPrefix, session.sessionId, n), data, "application/octet-stream");
      await recordPart(db, tenantId, session.sessionId, n);
      return c.json({ part: n });
    },
  );

  app.post("/media/upload-session/:id/complete", async (c) => {
    const session = await claimSession(db, tenantId, c.req.param("id"));
    if (!session) return c.json({ error: "No open upload session" }, 404);

    const total = partCount(session);
    const received = await countReceivedParts(db, tenantId, session.sessionId);
    if (received !== total) {
      await releaseSession(db, tenantId, session.sessionId);
      return c.json({ error: `Upload incomplete: ${received} of ${total} parts received` }, 409);
    }

    const keys = Array.from({ length: total }, (_, n) => partKey(keyPrefix, session.sessionId, n));
    // The session stores the normalized type, so this always resolves.
    const declared = normalizeAudioMime(session.mimeType)!;

    // Check the bytes before the file exists at any public key: the probe
    // reads the parts in order, as one stream, straight out of storage.
    const probe = await probeAudio(readPartsInOrder(storage, keys), session.size, declared);
    if (!probe.ok) {
      await discardSession(db, storage, keyPrefix, session);
      return c.json({ error: probe.reason }, 422);
    }

    const mediaId = randomUUID();
    const storageKey = `${keyPrefix}${mediaId}${probe.type.ext}`;
    try {
      await storage.assemble(keys, storageKey, probe.type.mimeType);
    } catch (err) {
      // Parts are untouched on failure; let the client retry `complete`.
      console.error("upload session assemble failed:", err);
      await releaseSession(db, tenantId, session.sessionId);
      return c.json({ error: "Could not store the file; try finishing the upload again" }, 502);
    }

    await insertMedia(
      db,
      {
        id: mediaId,
        storageKey,
        originalName: session.originalName,
        mimeType: probe.type.mimeType,
        size: session.size,
        durationSeconds: probe.durationSeconds,
      },
      tenantId,
    );
    await deleteSessionRows(db, tenantId, session.sessionId);

    fireMediaUploaded(ctx, {
      tenantId,
      mediaId,
      storageKey,
      filename: session.originalName,
      mimeType: probe.type.mimeType,
      size: session.size,
      durationSeconds: probe.durationSeconds,
    });

    return c.json(
      {
        id: mediaId,
        url: storage.url(storageKey),
        mimeType: probe.type.mimeType,
        size: session.size,
        durationSeconds: probe.durationSeconds,
      },
      201,
    );
  });

  app.delete("/media/upload-session/:id", async (c) => {
    const session = await getOpenSession(db, tenantId, c.req.param("id"));
    if (!session) return c.json({ error: "No open upload session" }, 404);
    await discardSession(db, storage, keyPrefix, session);
    return c.body(null, 204);
  });

  return app;
}

/**
 * The parts as one continuous stream, opened lazily one at a time. Destroying
 * the result (the probe does once it has read enough) closes the part being
 * read and never opens the rest.
 */
function readPartsInOrder(storage: MediaStorage, keys: readonly string[]): Readable {
  return Readable.from(
    (async function* () {
      for (const key of keys) {
        const part = await storage.openRead(key);
        if (!part) throw new Error(`upload part missing from storage: ${key}`);
        try {
          for await (const chunk of part) yield chunk as Buffer;
        } finally {
          part.destroy();
        }
      }
    })(),
    // Bytes, not objects: `Readable.from` defaults to object mode, where
    // `read(n)` hands back whole chunks and overruns the parser's buffers.
    { objectMode: false },
  );
}
