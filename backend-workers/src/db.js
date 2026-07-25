// src/db.js
//
// MongoDB Atlas access for Cloudflare Workers.
//
// Cloudflare Workers added `node:net` / `node:tls` support (behind the
// `nodejs_compat` flag), which is what lets the official `mongodb` driver
// open a real TCP/TLS connection to Atlas from a Worker. See:
//   https://developers.cloudflare.com/workers/runtime-apis/nodejs/
//   https://www.mongodb.com/community/forums/t/cloudflare-workers-integration-is-now-possible/226708
//
// The MongoDB Atlas Data API (the old REST-over-HTTPS option) was
// deprecated by MongoDB in 2025, so it is NOT used here.
//
// Connection caching: Workers can reuse module-scope (global) state across
// requests handled by the same isolate, so we cache the connected client on
// `globalThis` instead of reconnecting on every request. A cold start (new
// isolate) still pays the connection cost once. Keep the pool small — each
// isolate is a separate process from MongoDB's point of view, and a busy
// Worker may spin up many isolates, so a large per-isolate pool can exhaust
// your Atlas cluster's connection limit quickly. Size M10+ if you expect
// meaningful concurrent traffic.

import { MongoClient } from 'mongodb';

let clientPromise = null;
let indexesEnsured = false;

export async function getClient(env) {
  if (!env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not configured (set it with `wrangler secret put MONGODB_URI`)');
  }

  if (!clientPromise) {
    const client = new MongoClient(env.MONGODB_URI, {
      maxPoolSize: 5,
      minPoolSize: 0,
      maxIdleTimeMS: 10_000,
      serverSelectionTimeoutMS: 10_000,
    });
    clientPromise = client.connect();
  }

  try {
    return await clientPromise;
  } catch (err) {
    // Let the next request try to reconnect instead of caching a rejected promise forever.
    clientPromise = null;
    throw err;
  }
}

export async function getDb(env) {
  const client = await getClient(env);
  const db = client.db(env.MONGODB_DB_NAME || undefined);
  if (!indexesEnsured) {
    indexesEnsured = true;
    // Fire-and-forget-ish, but await so the very first request on a cold
    // isolate creates them before querying. Cheap no-op on subsequent calls
    // (createIndex is idempotent) — later requests skip this entirely
    // because of the flag above.
    await ensureIndexes(db).catch((err) => {
      console.error('Index setup failed (continuing anyway):', err.message);
      indexesEnsured = false; // retry on next request
    });
  }
  return db;
}

async function ensureIndexes(db) {
  await Promise.all([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('users').createIndex({ googleId: 1 }, { unique: true, sparse: true }),

    db.collection('books').createIndex({ slug: 1 }, { unique: true, sparse: true }),
    db.collection('courses').createIndex({ slug: 1 }, { unique: true, sparse: true }),

    db.collection('payments').createIndex({ merchantOrderId: 1 }, { unique: true }),
    db.collection('payments').createIndex({ downloadToken: 1 }, { unique: true, sparse: true }),
    db.collection('payments').createIndex({ userId: 1, status: 1 }),
    db.collection('payments').createIndex({ createdAt: -1 }),

    db.collection('purchases').createIndex({ transactionId: 1 }, { unique: true }),
    db.collection('purchases').createIndex({ downloadToken: 1 }, { unique: true, sparse: true }),
    db.collection('purchases').createIndex({ user: 1, book: 1 }),

    db.collection('ratings').createIndex({ user: 1, book: 1 }, { unique: true }),

    db.collection('otps').createIndex({ email: 1, purpose: 1 }),
    db.collection('otps').createIndex({ createdAt: 1 }, { expireAfterSeconds: 600 }),

    db.collection('otpratelimits').createIndex({ email: 1, purpose: 1 }, { unique: true }),
    db.collection('otpratelimits').createIndex({ windowStart: 1 }, { expireAfterSeconds: 24 * 60 * 60 }),
  ]);
}

// Runs once (best-effort) to make sure the configured admin account exists,
// mirroring the original config/database.js behaviour. Call this from a
// route you hit after deploying (e.g. GET /api/health) rather than on
// module load, since Workers have no long-lived startup phase.
export async function ensureAdminUser(db, env) {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return;
  const users = db.collection('users');
  const exists = await users.findOne({ email: env.ADMIN_EMAIL });
  if (exists) return;

  const bcrypt = await import('bcryptjs');
  const hashed = await bcrypt.hash(env.ADMIN_PASSWORD, 10);
  await users.insertOne({
    email: env.ADMIN_EMAIL,
    password: hashed,
    fullName: 'Admin User',
    mobileNumber: '9999999999',
    isAdmin: true,
    isVerified: true,
    isActive: true,
    authProvider: 'local',
    purchasedBooks: [],
    purchasedCourses: [],
    createdAt: new Date(),
  });
  console.log('Admin user created');
}
