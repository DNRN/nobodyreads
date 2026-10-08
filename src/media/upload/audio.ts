import type { Readable } from "node:stream";
import { parseStream } from "music-metadata";

/**
 * What an accepted audio file is, once its bytes have been looked at:
 * the canonical MIME type served for it and the extension its storage key gets.
 */
export interface AudioType {
  mimeType: string;
  ext: string;
}

const MPEG: AudioType = { mimeType: "audio/mpeg", ext: ".mp3" };
const MP4: AudioType = { mimeType: "audio/mp4", ext: ".m4a" };
const OGG: AudioType = { mimeType: "audio/ogg", ext: ".ogg" };
const WAV: AudioType = { mimeType: "audio/wav", ext: ".wav" };

/** Every type a browser or OS is known to declare for the accepted formats. */
const DECLARED: Record<string, AudioType> = {
  "audio/mpeg": MPEG,
  "audio/mp3": MPEG,
  "audio/mpeg3": MPEG,
  "audio/x-mpeg-3": MPEG,
  "audio/mp4": MP4,
  "audio/m4a": MP4,
  "audio/x-m4a": MP4,
  "audio/aac": MP4,
  "audio/ogg": OGG,
  "application/ogg": OGG,
  "audio/vorbis": OGG,
  "audio/wav": WAV,
  "audio/wave": WAV,
  "audio/x-wav": WAV,
  "audio/vnd.wave": WAV,
};

/**
 * The parser's container name (its first `/` segment) → the type it proves.
 *
 * MP4 has many entries because the first segment is the ISO base-media major
 * brand, and encoders disagree on it (`M4A ` from Apple tools, `mp42`/`isom`
 * from ffmpeg and most DAWs). The brand alone proves "MP4 family";
 * `hasVideo` decides whether it is audio.
 */
const SNIFFED_BY_CONTAINER: Record<string, AudioType> = {
  MPEG,
  Ogg: OGG,
  WAVE: WAV,
  M4A: MP4,
  M4B: MP4,
  M4P: MP4,
  mp41: MP4,
  mp42: MP4,
  isom: MP4,
  iso2: MP4,
  iso4: MP4,
  iso5: MP4,
  iso6: MP4,
  "3gp4": MP4,
  dash: MP4,
};

/** Map a declared Content-Type to the accepted audio type it names, or null. */
export function normalizeAudioMime(declared: string): AudioType | null {
  const bare = declared.split(";")[0].trim().toLowerCase();
  // Own keys only: the declared type is client input, and `constructor` or
  // `__proto__` must not resolve to something off Object.prototype.
  return Object.hasOwn(DECLARED, bare) ? DECLARED[bare] : null;
}

export type AudioProbe =
  | { ok: true; type: AudioType; durationSeconds: number }
  | { ok: false; reason: string };

/**
 * Read an uploaded file's own headers and decide whether it is the audio it
 * claims to be.
 *
 * The format is sniffed from the bytes with **no** MIME hint: the parser
 * trusts a hint over the bytes, so passing the declared type would let a
 * mislabeled file sail through. The declared type is compared afterwards.
 *
 * A file whose duration cannot be determined is rejected, not accepted with a
 * blank — podcast feeds require it, and an unknown duration almost always
 * means the file is not what its name says.
 *
 * Always destroys `stream`: the parser may stop reading early.
 */
export async function probeAudio(
  stream: Readable,
  size: number,
  declared: AudioType,
): Promise<AudioProbe> {
  let format;
  try {
    ({ format } = await parseStream(stream, { size }, { duration: false, skipCovers: true }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `not a readable audio file (${message})` };
  } finally {
    stream.destroy();
  }

  const container = format.container?.split("/")[0] ?? "";
  const sniffed = Object.hasOwn(SNIFFED_BY_CONTAINER, container)
    ? SNIFFED_BY_CONTAINER[container]
    : undefined;

  if (!sniffed) {
    return { ok: false, reason: `unsupported audio format: ${format.container ?? "unknown"}` };
  }
  if (format.hasVideo) {
    return { ok: false, reason: "the file contains video; upload audio only" };
  }
  if (sniffed.mimeType !== declared.mimeType) {
    return {
      ok: false,
      reason: `declared ${declared.mimeType} but the file is ${sniffed.mimeType}`,
    };
  }

  const duration = format.duration;
  if (duration === undefined || !Number.isFinite(duration) || duration <= 0) {
    return { ok: false, reason: "the audio's duration could not be determined" };
  }

  return { ok: true, type: sniffed, durationSeconds: Math.max(1, Math.round(duration)) };
}
