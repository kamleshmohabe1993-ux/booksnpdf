// src/index.js
// Cloudflare Workers entry point. Port of server.js.

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getDb, ensureAdminUser, closeRequestDb } from './db.js';
import { verifyPhonePeConfig } from './utils/phonepe.js';

import authRoutes from './routes/auth.js';
import bookRoutes from './routes/books.js';
import courseRoutes from './routes/courses.js';
import paymentRoutes from './routes/payments.js';
import ratingRoutes from './routes/ratings.js';

const app = new Hono();

// ── DB connection lifecycle ──────────────────────────────────────────────
// Registered first so it wraps every other middleware/route: whatever
// MongoClient this request opened (via getDb(c), see db.js) gets closed
// here once the request is done, so its sockets never outlive the request
// context that created them. Do NOT remove this — see the comment in
// db.js for why caching the client across requests hangs the Worker.
app.use('*', async (c, next) => {
  try {
    await next();
  } finally {
    await closeRequestDb(c);
  }
});

// ── CORS ─────────────────────────────────────────────────────────────────
// Mirrors `app.use(cors({ origin: FRONTEND_URL, credentials: true }))`.
app.use('*', async (c, next) => {
  const corsMiddleware = cors({
    origin: c.env.FRONTEND_URL || 'http://localhost:4321',
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });
  return corsMiddleware(c, next);
});

// ── Routes ───────────────────────────────────────────────────────────────
app.route('/api/auth', authRoutes);
app.route('/api/books', bookRoutes);
app.route('/api/courses', courseRoutes);
app.route('/api/payments', paymentRoutes);
app.route('/api/ratings', ratingRoutes);

// ── Health check (also lazily ensures the admin user exists, since Workers
//    have no persistent startup phase to run this once like the original
//    config/database.js did on every `node server.js` boot) ───────────────
app.get('/api/health', async (c) => {
  let dbOk = true;
  try {
    const db = await getDb(c);
    await ensureAdminUser(db, c.env);
  } catch (err) {
    console.error('Health check DB error:', err.message);
    dbOk = false;
  }

  return c.json({
    success: dbOk,
    message: dbOk ? 'Server is running' : 'Server is running but database is unreachable',
    phonepe: verifyPhonePeConfig(c.env),
  });
});

// ── 404 ──────────────────────────────────────────────────────────────────
app.notFound((c) => c.json({ success: false, error: 'Not found' }, 404));

// ── Error handling middleware (port of middleware/errorHandler.js) ────────
app.onError((err, c) => {
  console.error('❌ Error:', err);

  let statusCode = err.statusCode || 500;
  let message = err.message || 'Server Error';

  if (err.name === 'CastError' || err.message?.includes('ObjectId')) {
    statusCode = 404;
    message = 'Resource not found';
  }
  if (err.code === 11000) {
    statusCode = 400;
    message = 'Duplicate field value entered';
  }
  if (err.name === 'JWTExpired' || err.code === 'ERR_JWT_EXPIRED') {
    statusCode = 401;
    message = 'Token expired';
  }
  if (err.name === 'JWSSignatureVerificationFailed' || err.name === 'JWTInvalid') {
    statusCode = 401;
    message = 'Invalid token';
  }

  return c.json(
    {
      success: false,
      error: message,
      stack: c.env.NODE_ENV === 'development' ? err.stack : undefined,
    },
    statusCode
  );
});

export default app;
