// src/services/otpService.js
// Port of services/otpServices.js — same logic, native driver instead of Mongoose.

import { randomOtp } from '../lib/crypto.js';

const DEFAULT_PURPOSE = 'password_reset';
export const MAX_SENDS_PER_WINDOW = 5;
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export const generateOTP = randomOtp;

export async function storeOTP(db, email, otp, purpose = DEFAULT_PURPOSE) {
  const otps = db.collection('otps');
  await otps.deleteOne({ email: email.toLowerCase(), purpose });
  await otps.insertOne({ email: email.toLowerCase(), otp, purpose, attempts: 0, createdAt: new Date() });
}

export async function verifyOTP(db, email, otp, purpose = DEFAULT_PURPOSE) {
  const otps = db.collection('otps');
  const stored = await otps.findOne({ email: email.toLowerCase(), purpose });
  if (!stored) return { success: false, error: 'OTP not found or expired' };

  if (stored.attempts >= 5) {
    await otps.deleteOne({ email: email.toLowerCase(), purpose });
    return { success: false, error: 'Too many failed attempts. Please request a new OTP.' };
  }

  if (stored.otp !== otp) {
    await otps.updateOne({ _id: stored._id }, { $inc: { attempts: 1 } });
    return { success: false, error: 'Invalid OTP', attemptsLeft: 5 - (stored.attempts + 1) };
  }

  return { success: true };
}

export async function deleteOTP(db, email, purpose = DEFAULT_PURPOSE) {
  await db.collection('otps').deleteOne({ email: email.toLowerCase(), purpose });
}

export async function otpExists(db, email, purpose = DEFAULT_PURPOSE) {
  const stored = await db.collection('otps').findOne({ email: email.toLowerCase(), purpose });
  return !!stored;
}

export async function getRemainingTime(db, email, purpose = DEFAULT_PURPOSE) {
  const stored = await db.collection('otps').findOne({ email: email.toLowerCase(), purpose });
  if (!stored) return 0;
  const expiresAt = new Date(stored.createdAt).getTime() + 10 * 60 * 1000;
  const remaining = Math.floor((expiresAt - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

// Enforces "max 5 OTP sends per email+purpose per rolling 24 hours".
export async function checkAndRegisterSend(db, email, purpose = DEFAULT_PURPOSE, max = MAX_SENDS_PER_WINDOW) {
  const rateLimits = db.collection('otpratelimits');
  const emailLower = email.toLowerCase();
  const record = await rateLimits.findOne({ email: emailLower, purpose });

  if (!record) {
    await rateLimits.insertOne({ email: emailLower, purpose, count: 1, windowStart: new Date() });
    return { allowed: true, remaining: max - 1 };
  }

  if (record.count >= max) {
    const resetAt = new Date(record.windowStart).getTime() + WINDOW_MS;
    const retryAfterSeconds = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  await rateLimits.updateOne({ _id: record._id }, { $inc: { count: 1 } });
  return { allowed: true, remaining: max - (record.count + 1) };
}

export function formatRetryAfter(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.ceil((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m`;
  return 'a minute';
}
