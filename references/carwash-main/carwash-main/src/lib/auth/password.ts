// PBKDF2 password & PIN hashing using the Web Crypto API.
// Workers-compatible (no Node.js crypto, no bcrypt).

const ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

export interface HashResult {
  hash: string;
  salt: string;
}

export async function hashSecret(secret: string): Promise<HashResult> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const bits = await derive(secret, salt);
  return {
    hash: bytesToBase64(new Uint8Array(bits)),
    salt: bytesToBase64(salt),
  };
}

export async function verifySecret(
  secret: string,
  storedHash: string,
  storedSalt: string,
): Promise<boolean> {
  const salt = base64ToBytes(storedSalt);
  const bits = await derive(secret, salt);
  const computed = bytesToBase64(new Uint8Array(bits));
  return constantTimeEqual(computed, storedHash);
}

async function derive(secret: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  return crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH * 8,
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
