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
// IMPORTANT — do NOT cache the MongoClient across requests (we used to,
// via a module-scope `clientPromise` on globalThis). Workers isolates each
// invocation's I/O: the mongodb driver's internal connection-pool
// bookkeeping (ConnectionPool.processWaitQueue, monitoring/heartbeat
// sockets, etc.) is tied to whichever request context created it. Once
// that request ends, the runtime cancels any later attempt to resolve
// those promises from a *different* request ("A promise was resolved or
// rejected from a different request context..."), which leaves that other
// request's connection checkout hanging until Workers force-kills it
// ("...detected that your Worker's code had hung"). This is a known
// limitation of reusing stateful TCP-pool DB drivers across Worker
// invocations — see https://github.com/cloudflare/workerd/discussions/2721.
//
// Instead we open one MongoClient per request, cached only on the Hono
// request context `c` (so multiple `getDb(c)` calls within the same
// request — e.g. the auth middleware and the route handler — share one
// connection), and close it once that request finishes (see the
// request-scoped middleware in index.js). This pays a fresh connect()
// per request, but keeps every socket's lifecycle inside the single
// request that opened it, which is what the Workers runtime requires.

import { MongoClient } from 'mongodb';

let indexesEnsured = false; // plain boolean, not tied to any request's I/O — safe to keep across requests

export async function getDb(c) {
  const env = c.env;
  if (!env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not configured (set it with `wrangler secret put MONGODB_URI`)');
  }

  let client = c.get('_mongoClient');
  if (!client) {
    client = new MongoClient(env.MONGODB_URI, {
      maxPoolSize: 5,
      minPoolSize: 0,
      maxIdleTimeMS: 10_000,
      serverSelectionTimeoutMS: 10_000,
    });
    await client.connect();
    c.set('_mongoClient', client);
  }

  const db = client.db(env.MONGODB_DB_NAME || undefined);
  if (!indexesEnsured) {
    indexesEnsured = true;
    // Cheap no-op on subsequent calls (createIndex is idempotent) — later
    // requests skip this entirely because of the flag above.
    await ensureIndexes(db).catch((err) => {
      console.error('Index setup failed (continuing anyway):', err.message);
      indexesEnsured = false; // retry on next request
    });
  }
  return db;
}

// Call once per request, after the response has been produced (see the
// middleware registered in index.js), to close the connection this
// request opened — within the same request context that created it.
export async function closeRequestDb(c) {
  const client = c.get('_mongoClient');
  if (client) {
    try {
      await client.close();
    } catch (err) {
      console.error('Error closing MongoDB connection:', err.message);
    }
  }
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
