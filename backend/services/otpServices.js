const OTP = require('../models/OTP');
const OtpRateLimit = require('../models/OtpRateLimit');
const crypto = require('crypto');

const DEFAULT_PURPOSE = 'password_reset';
const MAX_SENDS_PER_WINDOW = 5;
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

exports.MAX_SENDS_PER_WINDOW = MAX_SENDS_PER_WINDOW;

exports.generateOTP = () => crypto.randomInt(100000, 999999).toString();

exports.storeOTP = async (email, otp, purpose = DEFAULT_PURPOSE) => {
    await OTP.deleteOne({ email: email.toLowerCase(), purpose });
    await OTP.create({ email: email.toLowerCase(), otp, purpose, attempts: 0 });
};

exports.verifyOTP = async (email, otp, purpose = DEFAULT_PURPOSE) => {
    const stored = await OTP.findOne({ email: email.toLowerCase(), purpose });
    if (!stored) return { success: false, error: 'OTP not found or expired' };

    if (stored.attempts >= 5) {
        await OTP.deleteOne({ email: email.toLowerCase(), purpose });
        return { success: false, error: 'Too many failed attempts. Please request a new OTP.' };
    }

    if (stored.otp !== otp) {
        stored.attempts += 1;
        await stored.save();
        return { success: false, error: 'Invalid OTP', attemptsLeft: 5 - stored.attempts };
    }

    return { success: true };
};

exports.deleteOTP = async (email, purpose = DEFAULT_PURPOSE) => {
    await OTP.deleteOne({ email: email.toLowerCase(), purpose });
};

exports.otpExists = async (email, purpose = DEFAULT_PURPOSE) => {
    const stored = await OTP.findOne({ email: email.toLowerCase(), purpose });
    return !!stored;
};

exports.getRemainingTime = async (email, purpose = DEFAULT_PURPOSE) => {
    const stored = await OTP.findOne({ email: email.toLowerCase(), purpose });
    if (!stored) return 0;
    const expiresAt = new Date(stored.createdAt).getTime() + 10 * 60 * 1000;
    const remaining = Math.floor((expiresAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : 0;
};

/**
 * Enforces "max 5 OTP sends per email+purpose per rolling 24 hours".
 * Call this immediately before actually sending an OTP. If it returns
 * allowed:false, do NOT send/store a new OTP.
 *
 * Uses a separate OtpRateLimit collection (rather than counting OTP docs)
 * because individual OTP codes auto-expire after 10 minutes — long before
 * a 24-hour send cap would be meaningful.
 */
exports.checkAndRegisterSend = async (email, purpose = DEFAULT_PURPOSE, max = MAX_SENDS_PER_WINDOW) => {
    const emailLower = email.toLowerCase();
    const record = await OtpRateLimit.findOne({ email: emailLower, purpose });

    if (!record) {
        await OtpRateLimit.create({ email: emailLower, purpose, count: 1 });
        return { allowed: true, remaining: max - 1 };
    }

    if (record.count >= max) {
        const resetAt = new Date(record.windowStart).getTime() + WINDOW_MS;
        const retryAfterSeconds = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
        return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    record.count += 1;
    await record.save();
    return { allowed: true, remaining: max - record.count };
};

// "9045" -> "2h 31m". Used to make 429 rate-limit messages readable.
exports.formatRetryAfter = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.ceil((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    if (mins > 0) return `${mins}m`;
    return 'a minute';
};
