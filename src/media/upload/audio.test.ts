import { describe, it, expect } from "vitest";
import { createReadStream, statSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { normalizeAudioMime, probeAudio, type AudioType } from "./audio.js";

/**
 * The probe is what keeps a mislabeled or non-audio file out of a podcast
 * feed, so each case runs on real encoded bytes (3 s tones from ffmpeg), not
 * on hand-built headers the parser might treat differently.
 */

const FIXTURES = join(import.meta.dirname, "fixtures");

function probeFixture(name: string, declaredMime: string) {
  const path = join(FIXTURES, name);
  return probeAudio(createReadStream(path), statSync(path).size, normalizeAudioMime(declaredMime)!);
}

describe("probeAudio", () => {
  it.each([
    ["tone.mp3", "audio/mpeg", ".mp3"],
    ["tone.m4a", "audio/mp4", ".m4a"],
    ["tone.ogg", "audio/ogg", ".ogg"],
    ["tone.wav", "audio/wav", ".wav"],
  ])("accepts %s with its canonical type and a real duration", async (file, mime, ext) => {
    const probe = await probeFixture(file, mime);

    expect(probe).toEqual({ ok: true, type: { mimeType: mime, ext }, durationSeconds: 3 });
  });

  it("rejects a file whose bytes contradict the declared type", async () => {
    const probe = await probeFixture("tone.wav", "audio/mpeg");

    expect(probe).toEqual({ ok: false, reason: "declared audio/mpeg but the file is audio/wav" });
  });

  it("rejects video wearing an audio extension", async () => {
    const probe = await probeFixture("video.m4a", "audio/mp4");

    expect(probe.ok).toBe(false);
  });

  it("rejects bytes that are not audio at all", async () => {
    const noise = Buffer.alloc(4096, 0x5a);
    const mpeg: AudioType = { mimeType: "audio/mpeg", ext: ".mp3" };

    const probe = await probeAudio(Readable.from([noise]), noise.length, mpeg);

    expect(probe.ok).toBe(false);
  });
});

describe("normalizeAudioMime", () => {
  it("folds browser aliases onto one canonical type", () => {
    expect(normalizeAudioMime("audio/x-m4a")?.mimeType).toBe("audio/mp4");
    expect(normalizeAudioMime("audio/x-wav")?.mimeType).toBe("audio/wav");
    expect(normalizeAudioMime("Audio/MPEG; charset=binary")?.mimeType).toBe("audio/mpeg");
  });

  it("rejects types outside the accepted set", () => {
    expect(normalizeAudioMime("image/png")).toBeNull();
    expect(normalizeAudioMime("audio/flac")).toBeNull();
  });

  it("does not resolve Object.prototype keys from client input", () => {
    expect(normalizeAudioMime("constructor")).toBeNull();
    expect(normalizeAudioMime("__proto__")).toBeNull();
  });
});
