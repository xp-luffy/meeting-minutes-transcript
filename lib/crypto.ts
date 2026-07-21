import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * AES-256-GCM for credentials at rest.
 *
 * THE POINT OF THIS FILE IS THAT IT REFUSES TO WORK WHEN MISCONFIGURED.
 *
 * A real system in this estate falls through to a constant that is readable in
 * its own source when the master-key env var is wrong. Everything above it then
 * looks encrypted: the write succeeds, the column is ciphertext-shaped, the UI
 * shows a masked value — and the data is protected by a key published in the
 * repository. A fail-open crypto default is indistinguishable from success at
 * every layer above it, which is exactly why it survives review.
 *
 * So: missing key throws. Malformed key throws. Wrong-length key throws. There
 * is no default, no fallback, and no "development mode" that quietly weakens
 * it — a dev fallback is how the constant gets into production in the first
 * place.
 *
 * Key format: 64 hex characters (32 bytes). Generate with
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

const KEY_BYTES = 32;
const IV_BYTES = 12; // GCM standard
const VERSION = "v1";

function masterKey(): Buffer {
  const raw = process.env.GS_ENCRYPTION_KEY;

  if (!raw || raw.trim().length === 0) {
    throw new Error(
      "GS_ENCRYPTION_KEY is not set. Credentials cannot be stored or read. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }

  const hex = raw.trim();
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("GS_ENCRYPTION_KEY is malformed — expected hex characters only.");
  }
  if (hex.length !== KEY_BYTES * 2) {
    throw new Error(
      `GS_ENCRYPTION_KEY is the wrong length — expected ${KEY_BYTES * 2} hex characters (${KEY_BYTES} bytes), got ${hex.length}.`,
    );
  }

  return Buffer.from(hex, "hex");
}

/** True when a usable master key is configured. Never reveals the key. */
export function encryptionAvailable(): boolean {
  try {
    masterKey();
    return true;
  } catch {
    return false;
  }
}

/** Human-readable reason encryption is unavailable, for an admin screen. */
export function encryptionUnavailableReason(): string | null {
  try {
    masterKey();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "GS_ENCRYPTION_KEY is unusable.";
  }
}

/**
 * Encrypt a secret. Output is `v1.<iv>.<authTag>.<ciphertext>`, all base64url.
 *
 * The version prefix exists so the key can be rotated later without guessing
 * how an old value was produced.
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(
    ".",
  );
}

/**
 * Decrypt. Throws on a tampered or truncated value rather than returning
 * something plausible — GCM's auth tag is the whole reason to use it.
 */
export function decryptSecret(encoded: string): string {
  const parts = encoded.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Stored credential is not in the expected format.");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Last 4 characters, for display only. Never enough to reconstruct the key. */
export function last4(secret: string): string {
  return secret.slice(-4);
}
