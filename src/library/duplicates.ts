/**
 * Content hashing for per-book identity (Phase 0 R4).
 *
 * SHA-256 via SubtleCrypto, hex-encoded, truncated to 16 chars (= 64 bits).
 * Pure functions of input.
 *
 * The bundled sample uses the literal id "sample" — namespace-disjoint from
 * any hash output (which is always 16 lowercase hex chars).
 */

const HASH_LENGTH = 16;

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

/** Hash raw file bytes (used for EPUBs — file-byte-identity). */
export async function hashFileBytes(buffer: ArrayBuffer): Promise<string> {
  // Wrap in Uint8Array — jsdom's SubtleCrypto polyfill requires a TypedArray
  // rather than a bare ArrayBuffer. Native browser / Node implementations
  // accept both, so this is defence in depth.
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(buffer));
  return bytesToHex(new Uint8Array(digest)).slice(0, HASH_LENGTH);
}

/** Hash normalised text content (used for plain text — content-identity). */
export async function hashNormalisedText(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest)).slice(0, HASH_LENGTH);
}
