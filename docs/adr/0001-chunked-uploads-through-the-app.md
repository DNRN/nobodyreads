# Chunked uploads through the app, not direct-to-storage

Hosting platforms commonly cap HTTP request bodies (Cloud Run, for one, at
32 MB) — far below podcast-length audio — so large media needs a strategy.
We decided uploads travel as **16 MiB chunks through the app's own routes**,
reassembled by each `MediaStorage` implementation (Local: append to temp file;
GCS: part objects + `compose`; S3: native multipart), rather than handing the
client a signed direct-to-storage URL.

## Considered Options

- **Direct-to-storage signed/resumable URLs** — zero bytes through the app,
  but the engine would have to expose provider-specific upload-target creation
  per storage impl, and every shell's auth/CORS/bucket policy becomes part of
  the contract. Rejected: it splits one feature across two trust boundaries
  and makes the OSS engine's storage seam wider for every consumer.
- **Single request through the existing upload route** — simplest, but capped
  by whatever body limit the host imposes; not viable for audio.

## Consequences

- One upload code path for all storage backends and self-hosts; idempotent
  re-PUT of a part gives client-side retry and resume within a session for
  free.
- The engine owns session lifecycle: aborted/stale sessions must be swept
  (24 h TTL, opportunistic GC) so orphaned parts cannot accumulate.
- Part count × chunk size bounds the max upload: 32 parts × 16 MiB = 512 MiB
  ceiling under GCS `compose`. Upload caps must be configured below that.
