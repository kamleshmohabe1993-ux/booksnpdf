// src/lib/crypto.js
//
// Replaces Node's `crypto` module (crypto.randomBytes, crypto.randomInt,
// crypto.createHash) with the Web Crypto API, which is what's actually
// available in the Workers runtime (globalThis.crypto).

// Equivalent of crypto.randomBytes(n).toString('hex')
export function randomHex(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Equivalent of crypto.randomInt(100000, 999999) — a 6-digit OTP.
export function randomOtp() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return (100000 + (arr[0] % 900000)).toString();
}

// Equivalent of crypto.createHash('sha256').update(str).digest('hex')
export async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time string compare (best effort in JS) for webhook auth checks.
export function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
