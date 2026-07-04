import { describe, it, expect, beforeEach } from "vitest";
import {
  encryptSecret,
  decryptSecret,
  isSecretsEncryptionAvailable,
} from "./secrets.js";

describe("secrets (AES-256-GCM)", () => {
  beforeEach(() => {
    // A non-32-byte string is SHA-256-derived to a valid key.
    process.env.SETTINGS_ENC_KEY = "test-encryption-key-for-secrets";
  });

  it("round-trips a plaintext secret", () => {
    const plain = "sk-super-secret-api-key-12345";
    const blob = encryptSecret(plain);
    expect(blob).not.toContain(plain);
    expect(blob.startsWith("v1:")).toBe(true);
    expect(decryptSecret(blob)).toBe(plain);
  });

  it("produces a fresh ciphertext each call (random IV)", () => {
    const plain = "same-input";
    expect(encryptSecret(plain)).not.toBe(encryptSecret(plain));
  });

  it("returns null for empty, malformed, or wrong-key blobs", () => {
    expect(decryptSecret(null)).toBeNull();
    expect(decryptSecret("")).toBeNull();
    expect(decryptSecret("not-a-blob")).toBeNull();
    // A blob encrypted under one key can't be read after the key rotates.
    const blob = encryptSecret("hello");
    process.env.SETTINGS_ENC_KEY = "a-different-encryption-key";
    expect(decryptSecret(blob)).toBeNull(); // auth tag mismatch under new key
  });

  it("reports availability from the env key", () => {
    expect(isSecretsEncryptionAvailable()).toBe(true);
    delete process.env.SETTINGS_ENC_KEY;
    expect(isSecretsEncryptionAvailable()).toBe(false);
  });
});
