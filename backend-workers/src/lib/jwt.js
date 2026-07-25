// src/lib/jwt.js
//
// Replaces `jsonwebtoken` (which relies on Node's `crypto` module in ways
// that are flaky on edge runtimes) with `jose`, which is built on the Web
// Crypto API and works natively in Cloudflare Workers.

import { SignJWT, jwtVerify } from 'jose';

function key(env) {
  if (!env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  return new TextEncoder().encode(env.JWT_SECRET);
}

// payload: plain object, e.g. { id: userId, email }
// expiresIn: jose duration string, e.g. '7h', '7d'
export async function signToken(payload, env, expiresIn) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn || env.JWT_EXPIRE || '7h')
    .sign(key(env));
}

// Throws if invalid/expired — callers should try/catch.
export async function verifyToken(token, env) {
  const { payload } = await jwtVerify(token, key(env));
  return payload;
}
