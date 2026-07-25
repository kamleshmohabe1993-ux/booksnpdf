// src/lib/googleAuth.js
//
// Replaces `google-auth-library`'s OAuth2Client.verifyIdToken(), which
// depends on Node-specific HTTP/gaxios internals, with a direct JWKS
// verification using `jose` (fetch + Web Crypto — both native to Workers).

import { createRemoteJWKSet, jwtVerify } from 'jose';

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

// jose caches the JWKS response internally per-process; keep the set on
// globalThis so repeated calls within the same isolate reuse it instead of
// re-fetching Google's certs on every login.
function getJWKS() {
  if (!globalThis.__googleJWKS) {
    globalThis.__googleJWKS = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
  }
  return globalThis.__googleJWKS;
}

// Returns the decoded ID token payload (sub, email, name, picture,
// email_verified, ...) or throws if invalid/expired/wrong audience.
export async function verifyGoogleIdToken(idToken, audience) {
  const { payload } = await jwtVerify(idToken, getJWKS(), {
    issuer: GOOGLE_ISSUERS,
    audience,
  });
  return payload;
}
