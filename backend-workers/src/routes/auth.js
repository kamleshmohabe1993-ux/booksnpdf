// src/routes/auth.js
// Port of routes/auth.js + controllers/authController.js + controllers/userController.js
// (mounted at /api/auth, matching the original router).

import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import { getDb } from '../db.js';
import { signToken } from '../lib/jwt.js';
import { verifyGoogleIdToken } from '../lib/googleAuth.js';
import { protect, adminOnly } from '../middleware/auth.js';
import * as otpService from '../services/otpService.js';
import { sendOTPEmail } from '../services/emailService.js';

const auth = new Hono();

function publicUser(user) {
  if (!user) return null;
  const { password, ...rest } = user;
  return rest;
}

async function setAuthCookie(c, token) {
  setCookie(c, 'auth_token', token, {
    httpOnly: true,
    secure: c.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });
}

// ── POST /api/auth/register ────────────────────────────────────────────────
auth.post('/register', async (c) => {
  try {
    const { email, password, fullName, mobileNumber } = await c.req.json();
    if (!email || !password || !fullName || !mobileNumber) {
      return c.json({ success: false, error: 'Please provide all required fields' }, 400);
    }
    if (password.length < 6) {
      return c.json({ success: false, error: 'Password must be at least 6 characters' }, 400);
    }

    const db = await getDb(c);
    const users = db.collection('users');

    const exists = await users.findOne({ email: email.toLowerCase() });
    if (exists) {
      return c.json({ success: false, error: 'User already exists with this email' }, 400);
    }

    const hashed = await bcrypt.hash(password, 10);
    const now = new Date();
    const { insertedId } = await users.insertOne({
      email: email.toLowerCase(),
      password: hashed,
      fullName,
      mobileNumber,
      authProvider: 'local',
      isAdmin: false,
      isVerified: false,
      isActive: false,
      purchasedBooks: [],
      purchasedCourses: [],
      createdAt: now,
    });

    const token = await signToken({ id: insertedId.toString() }, c.env, c.env.JWT_EXPIRE);

    // Best-effort verification OTP — must never block registration.
    try {
      const limit = await otpService.checkAndRegisterSend(db, email, 'email_verification');
      if (limit.allowed) {
        const otp = otpService.generateOTP();
        await otpService.storeOTP(db, email, otp, 'email_verification');
        await sendOTPEmail(c.env, email, otp, fullName, 'email_verification');
      }
    } catch (otpError) {
      console.error('Failed to send verification OTP on register:', otpError.message);
    }

    return c.json(
      {
        success: true,
        data: {
          _id: insertedId,
          email: email.toLowerCase(),
          fullName,
          isAdmin: false,
          isVerified: false,
          token,
        },
      },
      201
    );
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ── POST /api/auth/login ───────────────────────────────────────────────────
auth.post('/login', async (c) => {
  try {
    const { email, password } = await c.req.json();
    if (!email || !password) {
      return c.json({ success: false, error: 'Please provide email and password' }, 400);
    }

    const db = await getDb(c);
    const user = await db.collection('users').findOne({ email: email.toLowerCase() });
    if (!user || !user.password) {
      return c.json({ success: false, error: 'Invalid credentials' }, 401);
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return c.json({ success: false, error: 'Invalid credentials' }, 401);
    }

    const token = await signToken({ id: user._id.toString(), email: user.email }, c.env, '7h');
    await setAuthCookie(c, token);

    return c.json({
      success: true,
      data: {
        _id: user._id,
        email: user.email,
        fullName: user.fullName,
        isAdmin: user.isAdmin,
        isVerified: user.isVerified,
        token,
      },
    });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ── POST /api/auth/google ──────────────────────────────────────────────────
auth.post('/google', async (c) => {
  try {
    const { credential } = await c.req.json();
    if (!credential) return c.json({ success: false, error: 'Missing Google credential' }, 400);
    if (!c.env.GOOGLE_CLIENT_ID) {
      return c.json({ success: false, error: 'Google Sign-In is not configured on the server' }, 500);
    }

    let payload;
    try {
      payload = await verifyGoogleIdToken(credential, c.env.GOOGLE_CLIENT_ID);
    } catch {
      return c.json({ success: false, error: 'Invalid or expired Google credential' }, 401);
    }

    const { sub: googleId, email, name, picture, email_verified: emailVerified } = payload;
    if (!email) return c.json({ success: false, error: 'Google account has no email address' }, 400);

    const db = await getDb(c);
    const users = db.collection('users');

    let user = await users.findOne({ googleId });

    if (!user) {
      user = await users.findOne({ email: email.toLowerCase() });

      if (user) {
        const update = {
          googleId,
          authProvider: user.authProvider || 'google',
        };
        if (!user.avatar && picture) update.avatar = picture;
        if (emailVerified) update.isVerified = true;
        await users.updateOne({ _id: user._id }, { $set: update });
        user = { ...user, ...update };
      } else {
        const now = new Date();
        const doc = {
          email: email.toLowerCase(),
          fullName: name || email.split('@')[0],
          googleId,
          authProvider: 'google',
          avatar: picture,
          isAdmin: false,
          isVerified: !!emailVerified,
          isActive: true,
          purchasedBooks: [],
          purchasedCourses: [],
          createdAt: now,
        };
        const { insertedId } = await users.insertOne(doc);
        user = { _id: insertedId, ...doc };
      }
    }

    const token = await signToken({ id: user._id.toString(), email: user.email }, c.env, '7h');
    await setAuthCookie(c, token);

    return c.json({
      success: true,
      data: {
        _id: user._id,
        email: user.email,
        fullName: user.fullName,
        avatar: user.avatar,
        isAdmin: user.isAdmin,
        token,
      },
    });
  } catch (error) {
    console.error('Google login error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ── Password reset (OTP) flow ──────────────────────────────────────────────
auth.post('/forgot-password', async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email) return c.json({ success: false, error: 'Email is required' }, 400);

    const db = await getDb(c);
    const user = await db.collection('users').findOne({ email: email.toLowerCase() });

    if (!user) {
      // Don't reveal whether the email exists.
      return c.json({ success: true, message: 'If this email is registered, an OTP has been sent.' });
    }

    const exists = await otpService.otpExists(db, email, 'password_reset');
    if (exists) {
      const remaining = await otpService.getRemainingTime(db, email, 'password_reset');
      return c.json({ success: false, error: `OTP already sent. Please wait ${remaining} seconds before requesting again.` }, 429);
    }

    const limit = await otpService.checkAndRegisterSend(db, email, 'password_reset');
    if (!limit.allowed) {
      return c.json(
        {
          success: false,
          error: `You've reached the maximum of ${otpService.MAX_SENDS_PER_WINDOW} password reset requests in 24 hours. Please try again in ${otpService.formatRetryAfter(limit.retryAfterSeconds)}.`,
        },
        429
      );
    }

    const otp = otpService.generateOTP();
    await otpService.storeOTP(db, email, otp, 'password_reset');
    await sendOTPEmail(c.env, email, otp, user.fullName, 'password_reset');

    return c.json({ success: true, message: 'OTP sent to your email address.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    return c.json({ success: false, error: 'Failed to send OTP. Please try again.' }, 500);
  }
});

auth.post('/verify-reset-otp', async (c) => {
  try {
    const { email, otp } = await c.req.json();
    if (!email || !otp) return c.json({ success: false, error: 'Email and OTP are required' }, 400);

    const db = await getDb(c);
    const result = await otpService.verifyOTP(db, email, otp, 'password_reset');
    if (!result.success) return c.json(result, 400);

    return c.json({ success: true, message: 'OTP verified. You can now reset your password.' });
  } catch (error) {
    console.error('Verify OTP error:', error);
    return c.json({ success: false, error: 'Verification failed. Please try again.' }, 500);
  }
});

auth.post('/reset-password', async (c) => {
  try {
    const { email, otp, newPassword } = await c.req.json();
    if (!email || !otp || !newPassword) return c.json({ success: false, error: 'All fields are required' }, 400);
    if (newPassword.length < 6) return c.json({ success: false, error: 'Password must be at least 6 characters' }, 400);

    const db = await getDb(c);
    const result = await otpService.verifyOTP(db, email, otp, 'password_reset');
    if (!result.success) return c.json(result, 400);

    const hashed = await bcrypt.hash(newPassword, 12);
    await db.collection('users').updateOne({ email: email.toLowerCase() }, { $set: { password: hashed } });
    await otpService.deleteOTP(db, email, 'password_reset');

    return c.json({ success: true, message: 'Password reset successfully! You can now login.' });
  } catch (error) {
    console.error('Reset password error:', error);
    return c.json({ success: false, error: 'Password reset failed. Please try again.' }, 500);
  }
});

auth.post('/resend-otp', async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email) return c.json({ success: false, error: 'Email is required' }, 400);

    const db = await getDb(c);
    const user = await db.collection('users').findOne({ email: email.toLowerCase() });
    if (!user) return c.json({ success: false, error: 'User not found' }, 404);

    const limit = await otpService.checkAndRegisterSend(db, email, 'password_reset');
    if (!limit.allowed) {
      return c.json(
        {
          success: false,
          error: `You've reached the maximum of ${otpService.MAX_SENDS_PER_WINDOW} password reset requests in 24 hours. Please try again in ${otpService.formatRetryAfter(limit.retryAfterSeconds)}.`,
        },
        429
      );
    }

    await otpService.deleteOTP(db, email, 'password_reset');
    const otp = otpService.generateOTP();
    await otpService.storeOTP(db, email, otp, 'password_reset');
    await sendOTPEmail(c.env, email, otp, user.fullName, 'password_reset');

    return c.json({ success: true, message: 'New OTP sent to your email.' });
  } catch (error) {
    console.error('Resend OTP error:', error);
    return c.json({ success: false, error: 'Failed to resend OTP.' }, 500);
  }
});

auth.post('/send-email-otp', async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email) return c.json({ success: false, error: 'Email is required' }, 400);

    const db = await getDb(c);
    const user = await db.collection('users').findOne({ email: email.toLowerCase() });
    if (!user) return c.json({ success: false, error: 'No account found with this email address' }, 404);
    if (user.isVerified) return c.json({ success: true, alreadyVerified: true, message: 'This email is already verified.' });

    const exists = await otpService.otpExists(db, email, 'email_verification');
    if (exists) {
      const remaining = await otpService.getRemainingTime(db, email, 'email_verification');
      return c.json({ success: false, error: `OTP already sent. Please wait ${remaining} seconds before requesting again.` }, 429);
    }

    const limit = await otpService.checkAndRegisterSend(db, email, 'email_verification');
    if (!limit.allowed) {
      return c.json(
        {
          success: false,
          error: `You've reached the maximum of ${otpService.MAX_SENDS_PER_WINDOW} verification emails in 24 hours. Please try again in ${otpService.formatRetryAfter(limit.retryAfterSeconds)}.`,
        },
        429
      );
    }

    const otp = otpService.generateOTP();
    await otpService.storeOTP(db, email, otp, 'email_verification');
    await sendOTPEmail(c.env, email, otp, user.fullName, 'email_verification');

    return c.json({ success: true, message: 'A verification OTP has been sent to your email.', expiresIn: 600 });
  } catch (error) {
    console.error('Send email verification OTP error:', error);
    return c.json({ success: false, error: 'Failed to send verification OTP. Please try again.' }, 500);
  }
});

auth.post('/verify-email-otp', async (c) => {
  try {
    const { email, otp } = await c.req.json();
    if (!email || !otp) return c.json({ success: false, error: 'Email and OTP are required' }, 400);

    const db = await getDb(c);
    const result = await otpService.verifyOTP(db, email, otp, 'email_verification');
    if (!result.success) return c.json(result, 400);

    await db.collection('users').updateOne({ email: email.toLowerCase() }, { $set: { isVerified: true } });
    await otpService.deleteOTP(db, email, 'email_verification');

    return c.json({ success: true, message: 'Email verified successfully!' });
  } catch (error) {
    console.error('Verify email OTP error:', error);
    return c.json({ success: false, error: 'Verification failed. Please try again.' }, 500);
  }
});

// ── Authenticated profile routes ───────────────────────────────────────────
auth.get('/me', protect, async (c) => {
  return c.json({ success: true, data: publicUser(c.get('user')) });
});

auth.put('/profile', protect, async (c) => {
  try {
    const user = c.get('user');
    const { fullName, mobileNumber, interests } = await c.req.json();

    const update = {};
    if (fullName) update.fullName = fullName;
    if (mobileNumber) update.mobileNumber = mobileNumber;
    if (interests) update.interests = interests;

    const db = await getDb(c);
    await db.collection('users').updateOne({ _id: user._id }, { $set: update });

    return c.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        _id: user._id,
        email: user.email,
        fullName: update.fullName || user.fullName,
        mobileNumber: update.mobileNumber || user.mobileNumber,
        interests: update.interests || user.interests,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

auth.delete('/account', protect, async (c) => {
  try {
    const { password, userId } = await c.req.json();
    const currentUser = c.get('user');
    const db = await getDb(c);
    const profile = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!profile) return c.json({ success: false, error: 'Profile not found' }, 404);

    if (currentUser._id.toString() !== userId && !currentUser.isAdmin) {
      return c.json({ success: false, error: 'Unauthorized' }, 403);
    }
    if (!currentUser.isAdmin) {
      const isMatch = profile.password && (await bcrypt.compare(password || '', profile.password));
      if (!isMatch) return c.json({ success: false, error: 'Unauthorized' }, 403);
    }

    await db.collection('users').deleteOne({ _id: profile._id });
    return c.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

auth.put('/change-password', protect, async (c) => {
  try {
    const user = c.get('user');
    const { currentPassword, newPassword } = await c.req.json();

    const db = await getDb(c);
    const full = await db.collection('users').findOne({ _id: user._id });
    if (!full) return c.json({ success: false, error: 'User not found' }, 404);

    const isMatch = full.password && (await bcrypt.compare(currentPassword, full.password));
    if (!isMatch) return c.json({ success: false, error: 'Current password is incorrect' }, 401);

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.collection('users').updateOne({ _id: user._id }, { $set: { password: hashed } });

    return c.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ── Admin: user management (port of controllers/userController.js) ────────
auth.get('/users', protect, adminOnly, async (c) => {
  try {
    const { status, verified, search, sortBy = 'recent', page = 1, limit = 50 } = c.req.query();
    const db = await getDb(c);
    const users = db.collection('users');
    const purchases = db.collection('purchases');

    const query = {};
    if (status && status !== 'all') query.isActive = status === 'active';
    if (verified && verified !== 'all') query.isVerified = verified === 'verified';
    if (search && search.trim() !== '') {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { mobileNumber: { $regex: search, $options: 'i' } },
      ];
    }

    const sortMap = { recent: { createdAt: -1 }, oldest: { createdAt: 1 }, name: { fullName: 1 }, purchases: { createdAt: -1 } };
    const sortOption = sortMap[sortBy] || sortMap.recent;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const list = await users
      .find(query, { projection: { password: 0 } })
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum)
      .toArray();

    const totalUsers = await users.countDocuments(query);

    const userIds = list.map((u) => u._id);
    const purchaseStats = await purchases
      .aggregate([
        { $match: { user: { $in: userIds }, paymentStatus: 'COMPLETED' } },
        { $group: { _id: '$user', purchaseCount: { $sum: 1 }, totalSpent: { $sum: '$amount' } } },
      ])
      .toArray();

    const statsMap = {};
    purchaseStats.forEach((s) => {
      statsMap[s._id.toString()] = { purchaseCount: s.purchaseCount, totalSpent: s.totalSpent };
    });

    let usersWithStats = list.map((u) => ({
      ...u,
      purchaseCount: statsMap[u._id.toString()]?.purchaseCount || 0,
      totalSpent: statsMap[u._id.toString()]?.totalSpent || 0,
    }));

    if (sortBy === 'purchases') usersWithStats.sort((a, b) => b.purchaseCount - a.purchaseCount);

    const allUsers = await users.find({}).toArray();
    const allPurchases = await purchases.find({ paymentStatus: 'COMPLETED' }).toArray();

    const stats = {
      total: allUsers.length,
      active: allUsers.filter((u) => u.isActive).length,
      inactive: allUsers.filter((u) => !u.isActive).length,
      verified: allUsers.filter((u) => u.isVerified).length,
      unverified: allUsers.filter((u) => !u.isVerified).length,
      totalRevenue: allPurchases.reduce((sum, p) => sum + (p.amount || 0), 0),
    };

    return c.json({
      success: true,
      count: usersWithStats.length,
      total: totalUsers,
      page: pageNum,
      pages: Math.ceil(totalUsers / limitNum),
      stats,
      data: usersWithStats,
    });
  } catch (error) {
    console.error('❌ Get users error:', error);
    return c.json({ success: false, error: 'Failed to fetch users: ' + error.message }, 500);
  }
});

auth.get('/userstats', protect, adminOnly, async (c) => {
  try {
    const { startDate, endDate } = c.req.query();
    const db = await getDb(c);
    const users = db.collection('users');
    const purchases = db.collection('purchases');

    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    const allUsers = await users.find(dateFilter).toArray();
    const allPurchases = await purchases.find({ paymentStatus: 'COMPLETED' }).toArray();

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const registrationTrends = await users
      .aggregate([
        { $match: { createdAt: { $gte: twelveMonthsAgo } } },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ])
      .toArray();

    const topSpenders = await purchases
      .aggregate([
        { $match: { paymentStatus: 'COMPLETED' } },
        { $group: { _id: '$user', totalSpent: { $sum: '$amount' }, purchaseCount: { $sum: 1 } } },
        { $sort: { totalSpent: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'userDetails' } },
        { $unwind: '$userDetails' },
        { $project: { fullName: '$userDetails.fullName', email: '$userDetails.email', totalSpent: 1, purchaseCount: 1 } },
      ])
      .toArray();

    const stats = {
      overview: {
        total: allUsers.length,
        active: allUsers.filter((u) => u.isActive).length,
        inactive: allUsers.filter((u) => !u.isActive).length,
        verified: allUsers.filter((u) => u.isVerified).length,
        unverified: allUsers.filter((u) => !u.isVerified).length,
        admins: allUsers.filter((u) => u.isAdmin).length,
      },
      revenue: {
        totalRevenue: allPurchases.reduce((sum, p) => sum + p.amount, 0),
        averageRevenuePerUser: allUsers.length > 0 ? (allPurchases.reduce((sum, p) => sum + p.amount, 0) / allUsers.length).toFixed(2) : 0,
      },
      registrationTrends,
      topSpenders,
      recentUsers: await users
        .find({}, { projection: { fullName: 1, email: 1, createdAt: 1, isVerified: 1, isActive: 1 } })
        .sort({ createdAt: -1 })
        .limit(5)
        .toArray(),
    };

    return c.json({ success: true, data: stats });
  } catch (error) {
    console.error('Get user stats error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

auth.get('/exportusers', protect, adminOnly, async (c) => {
  try {
    const { status, verified, startDate, endDate } = c.req.query();
    const db = await getDb(c);
    const users = db.collection('users');
    const purchases = db.collection('purchases');

    const query = {};
    if (status && status !== 'all') query.isActive = status === 'active';
    if (verified && verified !== 'all') query.isVerified = verified === 'verified';
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const list = await users.find(query, { projection: { password: 0 } }).sort({ createdAt: -1 }).toArray();
    const userIds = list.map((u) => u._id);
    const purchaseStats = await purchases
      .aggregate([
        { $match: { user: { $in: userIds }, paymentStatus: 'COMPLETED' } },
        { $group: { _id: '$user', purchaseCount: { $sum: 1 }, totalSpent: { $sum: '$amount' } } },
      ])
      .toArray();

    const statsMap = {};
    purchaseStats.forEach((s) => (statsMap[s._id.toString()] = s));

    const sanitizeCSV = (value) => {
      const str = String(value ?? '');
      if (str.startsWith('=') || str.startsWith('+') || str.startsWith('-') || str.startsWith('@')) return `'${str}`;
      return `"${str.replace(/"/g, '""')}"`;
    };

    const csvHeader = 'ID,Name,Email,Mobile,Status,Verified,Role,Purchases,Total Spent,Last Login,Joined Date\n';
    const csvRows = list
      .map((user) => {
        const stats = statsMap[user._id.toString()] || { purchaseCount: 0, totalSpent: 0 };
        return [
          sanitizeCSV(user._id),
          sanitizeCSV(user.fullName),
          sanitizeCSV(user.email),
          sanitizeCSV(user.mobileNumber),
          sanitizeCSV(user.isActive ? 'Active' : 'Inactive'),
          sanitizeCSV(user.isVerified ? 'Yes' : 'No'),
          sanitizeCSV(user.isAdmin ? 'Admin' : 'User'),
          sanitizeCSV(stats.purchaseCount),
          sanitizeCSV(stats.totalSpent),
          sanitizeCSV(user.lastLogin ? new Date(user.lastLogin).toISOString() : 'Never'),
          sanitizeCSV(new Date(user.createdAt).toISOString()),
        ].join(',');
      })
      .join('\n');

    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename=users-export-${Date.now()}.csv`);
    return c.body(csvHeader + csvRows);
  } catch (error) {
    console.error('Export users error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

auth.get('/:id', protect, adminOnly, async (c) => {
  try {
    const db = await getDb(c);
    const userId = c.req.param('id');
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) }, { projection: { password: 0 } });
    if (!user) return c.json({ success: false, error: 'User not found' }, 404);

    const purchases = await db
      .collection('purchases')
      .aggregate([
        { $match: { user: user._id, paymentStatus: 'COMPLETED' } },
        { $lookup: { from: 'books', localField: 'book', foreignField: '_id', as: 'book' } },
        { $unwind: { path: '$book', preserveNullAndEmptyArrays: true } },
        { $sort: { purchasedAt: -1 } },
      ])
      .toArray();

    const stats = {
      purchaseCount: purchases.length,
      totalSpent: purchases.reduce((sum, p) => sum + p.amount, 0),
      freeDownloads: purchases.filter((p) => p.paymentGateway === 'Free').length,
      paidPurchases: purchases.filter((p) => p.paymentGateway !== 'Free').length,
    };

    const recentActivity = await db
      .collection('purchases')
      .find({ user: user._id })
      .sort({ purchasedAt: -1 })
      .limit(10)
      .toArray();

    return c.json({ success: true, data: { ...user, stats, purchases, recentActivity } });
  } catch (error) {
    console.error('Get user by ID error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

auth.put('/:id/toggle-status', protect, adminOnly, async (c) => {
  try {
    const db = await getDb(c);
    const currentUser = c.get('user');
    const userId = c.req.param('id');
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!user) return c.json({ success: false, error: 'User not found' }, 404);
    if (user._id.toString() === currentUser._id.toString()) {
      return c.json({ success: false, error: 'Cannot deactivate your own account' }, 400);
    }

    const newStatus = !user.isActive;
    await db.collection('users').updateOne({ _id: user._id }, { $set: { isActive: newStatus } });

    return c.json({
      success: true,
      message: `User ${newStatus ? 'activated' : 'deactivated'} successfully`,
      data: { _id: user._id, fullName: user.fullName, email: user.email, isActive: newStatus },
    });
  } catch (error) {
    console.error('Toggle status error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

auth.put('/:id/verify', protect, adminOnly, async (c) => {
  try {
    const db = await getDb(c);
    const userId = c.req.param('id');
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!user) return c.json({ success: false, error: 'User not found' }, 404);
    if (user.isVerified) return c.json({ success: false, error: 'User is already verified' }, 400);

    await db.collection('users').updateOne({ _id: user._id }, { $set: { isVerified: true } });

    return c.json({
      success: true,
      message: 'User verified successfully',
      data: { _id: user._id, fullName: user.fullName, email: user.email, isVerified: true },
    });
  } catch (error) {
    console.error('Verify user error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

auth.delete('/:id', protect, adminOnly, async (c) => {
  try {
    const db = await getDb(c);
    const currentUser = c.get('user');
    const userId = c.req.param('id');
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!user) return c.json({ success: false, error: 'User not found' }, 404);
    if (user._id.toString() === currentUser._id.toString()) {
      return c.json({ success: false, error: 'Cannot delete your own account' }, 400);
    }

    const activePurchases = await db.collection('purchases').countDocuments({ user: user._id, paymentStatus: 'COMPLETED' });
    if (activePurchases > 0) {
      return c.json({ success: false, error: `Cannot delete user with ${activePurchases} active purchases. Deactivate instead.` }, 400);
    }

    await db.collection('purchases').deleteMany({ user: user._id });
    await db.collection('users').deleteOne({ _id: user._id });

    return c.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

auth.post('/bulk-action', protect, adminOnly, async (c) => {
  try {
    const currentUser = c.get('user');
    const { userIds, action } = await c.req.json();
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return c.json({ success: false, error: 'Invalid user IDs array' }, 400);
    }

    const actionMap = {
      activate: { isActive: true },
      deactivate: { isActive: false },
      verify: { isVerified: true },
    };
    const updateOperation = actionMap[action];
    if (!updateOperation) return c.json({ success: false, error: 'Invalid action' }, 400);

    const filteredUserIds = userIds.filter((id) => id !== currentUser._id.toString()).map((id) => new ObjectId(id));

    const db = await getDb(c);
    const result = await db.collection('users').updateMany({ _id: { $in: filteredUserIds } }, { $set: updateOperation });

    return c.json({
      success: true,
      message: `${result.modifiedCount} users ${action}d successfully`,
      data: { modifiedCount: result.modifiedCount },
    });
  } catch (error) {
    console.error('Bulk action error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default auth;
