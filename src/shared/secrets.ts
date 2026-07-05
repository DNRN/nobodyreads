import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";

/**
 * Small AES-256-GCM encrypt/decrypt helpers for secrets stored at rest (e.g. a
 * tenant's BYO AI provider API key in `site_settings`). Generic on purpose:
 * later AI features (comment moderation) reuse the same store + these helpers.
 *
 * The key comes from `SETTINGS_ENC_KEY` (32 bytes as hex or base64, or any
 * string which is then SHA-256-derived to 32 bytes). Rotating the env value
 * invalidates previously stored secrets — users re-enter them.
 *
 * Serialized form: `v1:<iv-b64>:<tag-b64>:<ciphertext-b64>`.
 */

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce, standard for GCM

/** Resolve a 32-byte key from `SETTINGS_ENC_KEY`. Throws when unset. */
function resolveKey(): Buffer {
  const raw = process.env.SETTINGS_ENC_KEY;
  if (!raw) {
    throw new Error(
      "SETTINGS_ENC_KEY is not set — cannot encrypt/decrypt stored secrets.",
    );
  }
  // Accept a raw 32-byte hex or base64 key; otherwise derive one deterministically.
  const asHex = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : null;
  if (asHex && asHex.length === 32) return asHex;
  const asB64 = Buffer.from(raw, "base64");
  if (asB64.length === 32) return asB64;
  return createHash("sha256").update(raw).digest();
}

/** Encrypt a plaintext secret into the serialized `v1:…` form. */
export function encryptSecret(plaintext: string): string {
  const key = resolveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/**
 * Decrypt a `v1:…` blob produced by {@link encryptSecret}. Returns `null` for
 * an empty/unrecognised value so callers can treat "no key stored" and "key
 * unreadable" alike without throwing on legacy/plaintext rows.
 */
export function decryptSecret(blob: string | null | undefined): string | null {
  if (!blob) return null;
  const parts = blob.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const key = resolveKey();
    const iv = Buffer.from(parts[1], "base64");
    const tag = Buffer.from(parts[2], "base64");
    const ciphertext = Buffer.from(parts[3], "base64");
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    return null;
  }
}

/** Whether the encryption key is configured (so callers can gate BYO-key UI). */
export function isSecretsEncryptionAvailable(): boolean {
  return !!process.env.SETTINGS_ENC_KEY;
}
