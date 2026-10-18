import { and, eq, lt, count } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Database } from "../../db/index.js";
import type { MediaStorage } from "../storage.js";
import { uploadSession, uploadSessionPart } from "../schema.js";

/**
 * Size of every part but the last. One part per request keeps each request
 * under the 32 MB body cap common to serverless hosts (with header headroom),
 * and stays above S3's 5 MiB minimum multipart part size.
 */
export const UPLOAD_CHUNK_BYTES = 16 * 1024 * 1024;

/**
 * Default largest accepted file. 500 MB splits into 30 parts, inside the
 * 32-source ceiling of GCS `compose` — raising it past 32 × 16 MiB (512 MiB)
 * makes uploads fail on GCS-backed hosts, which upload sessions refuse up front
 * via `MediaStorage.maxParts`.
 */
export const DEFAULT_MAX_UPLOAD_BYTES = 500_000_000;

/** Sessions older than this are swept, parts and all. */
export const UPLOAD_SESSION_TTL_SECONDS = 24 * 60 * 60;

export type UploadSession = typeof uploadSession.$inferSelect;

/** How many parts a session's file splits into. */
export function partCount(session: Pick<UploadSession, "size" | "chunkBytes">): number {
  return Math.ceil(session.size / session.chunkBytes);
}

/** Storage key of part `n`. Parts live under the host's key prefix like any media. */
export function partKey(keyPrefix: string, sessionId: string, n: number): string {
  return `${keyPrefix}upload-sessions/${sessionId}/${n}`;
}

export async function createUploadSession(
  db: Database,
  s: { tenantId: string; originalName: string; mimeType: string; size: number; now: number },
): Promise<UploadSession> {
  const [row] = await db
    .insert(uploadSession)
    .values({
      sessionId: randomUUID(),
      tenantId: s.tenantId,
      originalName: s.originalName,
      mimeType: s.mimeType,
      size: s.size,
      chunkBytes: UPLOAD_CHUNK_BYTES,
      status: "open",
      createdAt: s.now,
    })
    .returning();
  return row;
}

/** The session, only while it still accepts parts. */
export async function getOpenSession(
  db: Database,
  tenantId: string,
  sessionId: string,
): Promise<UploadSession | null> {
  const rows = await db
    .select()
    .from(uploadSession)
    .where(
      and(
        eq(uploadSession.sessionId, sessionId),
        eq(uploadSession.tenantId, tenantId),
        eq(uploadSession.status, "open"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Idempotent: re-sending a part overwrites the object and records it once. */
export async function recordPart(
  db: Database,
  tenantId: string,
  sessionId: string,
  partNumber: number,
): Promise<void> {
  await db
    .insert(uploadSessionPart)
    .values({ sessionId, tenantId, partNumber })
    .onConflictDoNothing();
}

export async function countReceivedParts(
  db: Database,
  tenantId: string,
  sessionId: string,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(uploadSessionPart)
    .where(
      and(eq(uploadSessionPart.sessionId, sessionId), eq(uploadSessionPart.tenantId, tenantId)),
    );
  return row?.n ?? 0;
}

/**
 * Atomically move an open session to `completing`. Exactly one caller wins, so
 * a double-clicked "finish" cannot assemble the same parts twice.
 */
export async function claimSession(
  db: Database,
  tenantId: string,
  sessionId: string,
): Promise<UploadSession | null> {
  const rows = await db
    .update(uploadSession)
    .set({ status: "completing" })
    .where(
      and(
        eq(uploadSession.sessionId, sessionId),
        eq(uploadSession.tenantId, tenantId),
        eq(uploadSession.status, "open"),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

/** Undo a claim after a failure the client can retry (missing parts, storage error). */
export async function releaseSession(
  db: Database,
  tenantId: string,
  sessionId: string,
): Promise<void> {
  await db
    .update(uploadSession)
    .set({ status: "open" })
    .where(and(eq(uploadSession.sessionId, sessionId), eq(uploadSession.tenantId, tenantId)));
}

/** Remove a session's bookkeeping rows. Its part objects are the caller's concern. */
export async function deleteSessionRows(
  db: Database,
  tenantId: string,
  sessionId: string,
): Promise<void> {
  await db
    .delete(uploadSessionPart)
    .where(
      and(eq(uploadSessionPart.sessionId, sessionId), eq(uploadSessionPart.tenantId, tenantId)),
    );
  await db
    .delete(uploadSession)
    .where(and(eq(uploadSession.sessionId, sessionId), eq(uploadSession.tenantId, tenantId)));
}

/** Delete every part object a session could have written, then its rows. */
export async function discardSession(
  db: Database,
  storage: MediaStorage,
  keyPrefix: string,
  session: UploadSession,
): Promise<void> {
  const keys = Array.from({ length: partCount(session) }, (_, n) =>
    partKey(keyPrefix, session.sessionId, n),
  );
  // `delete` ignores missing objects, so never-sent parts cost nothing.
  await Promise.all(keys.map((k) => storage.delete(k)));
  await deleteSessionRows(db, session.tenantId, session.sessionId);
}

/**
 * Discard a tenant's upload sessions — their part objects, then their rows.
 *
 * With `createdBefore` (epoch seconds) only older sessions go: that is the
 * stale sweep, run opportunistically on session creation so no host needs a
 * cron job to keep abandoned parts from piling up. Without it every session
 * goes, which is what deleting a tenant needs — part keys are this module's
 * layout, so a host must not try to enumerate them itself.
 */
export async function discardUploadSessions(
  db: Database,
  storage: MediaStorage,
  keyPrefix: string,
  tenantId: string,
  options: { createdBefore?: number } = {},
): Promise<number> {
  const sessions = await db
    .select()
    .from(uploadSession)
    .where(
      and(
        eq(uploadSession.tenantId, tenantId),
        options.createdBefore === undefined
          ? undefined
          : lt(uploadSession.createdAt, options.createdBefore),
      ),
    );
  for (const session of sessions) {
    await discardSession(db, storage, keyPrefix, session);
  }
  return sessions.length;
}
