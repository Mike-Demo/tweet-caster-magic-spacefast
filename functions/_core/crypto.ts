/**
 * Symmetric encryption for the X developer credentials and tweet.app tokens.
 *
 * Wire format matches the original node:crypto implementation exactly:
 * base64(iv[12] || authTag[16] || ciphertext), AES-256-GCM, key = SHA-256
 * of the raw X_CRED_ENCRYPTION_KEY string. Server-only: the key never
 * leaves the worker environment.
 */

async function encryptionKey(raw: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function requireKey(raw: string | undefined): string {
  if (!raw) throw new Error("X_CRED_ENCRYPTION_KEY is not set");
  return raw;
}

export async function encryptSecret(plaintext: string, keyRaw: string | undefined): Promise<string> {
  const key = await encryptionKey(requireKey(keyRaw));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)),
  );
  // Web Crypto appends the 16-byte auth tag to the ciphertext; split it off
  // so the stored layout matches iv || tag || ct.
  const tag = ct.slice(ct.length - 16);
  const data = ct.slice(0, ct.length - 16);
  const out = new Uint8Array(12 + 16 + data.length);
  out.set(iv, 0);
  out.set(tag, 12);
  out.set(data, 28);
  return btoa(String.fromCharCode(...out));
}

export async function decryptSecret(stored: string, keyRaw: string | undefined): Promise<string> {
  const key = await encryptionKey(requireKey(keyRaw));
  const buf = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
  const iv = buf.slice(0, 12);
  const tag = buf.slice(12, 28);
  const data = buf.slice(28);
  const ct = new Uint8Array(data.length + 16);
  ct.set(data, 0);
  ct.set(tag, data.length);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(plain);
}
