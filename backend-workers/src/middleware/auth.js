// src/middleware/auth.js
// Port of middleware/auth.js (routes/auth.js + routes/books.js etc. all use
// this one — the near-duplicate controllers/auth.js in the original repo
// was never wired into any route, so it's intentionally not ported).

import { ObjectId } from 'mongodb';
import { verifyToken } from '../lib/jwt.js';
import { getDb } from '../db.js';

export async function protect(c, next) {
  const authHeader = c.req.header('Authorization') || c.req.header('authorization');
  let token;
  if (authHeader && authHeader.startsWith('Bearer')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    return c.json({ success: false, error: 'Not authorized to access this route' }, 401);
  }

  try {
    const decoded = await verifyToken(token, c.env);
    const db = await getDb(c.env);
    let userId;
    try {
      userId = new ObjectId(decoded.id);
    } catch {
      return c.json({ success: false, error: 'Not authorized to access this route' }, 401);
    }
    const user = await db.collection('users').findOne({ _id: userId }, { projection: { password: 0 } });

    if (!user) {
      return c.json({ success: false, error: 'User not found' }, 401);
    }

    c.set('user', user);
    await next();
  } catch (error) {
    return c.json({ success: false, error: 'Not authorized to access this route' }, 401);
  }
}

export async function adminOnly(c, next) {
  const user = c.get('user');
  if (!user || !user.isAdmin) {
    return c.json({ success: false, error: 'Admin access required' }, 403);
  }
  await next();
}
