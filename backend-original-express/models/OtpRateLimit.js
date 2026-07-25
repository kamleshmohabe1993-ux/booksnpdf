const mongoose = require('mongoose');

// Tracks how many OTPs have been SENT (not verify attempts) to a given
// email for a given purpose. One document per (email, purpose); it
// auto-expires 24 hours after the first send in the window, which gives a
// simple rolling 24-hour cap without a cron job: once the doc expires, the
// counter naturally resets.
const otpRateLimitSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        lowercase: true
    },
    purpose: {
        type: String,
        enum: ['password_reset', 'email_verification'],
        required: true
    },
    count: {
        type: Number,
        default: 0
    },
    windowStart: {
        type: Date,
        default: Date.now,
        expires: 24 * 60 * 60 // 24 hours
    }
});

otpRateLimitSchema.index({ email: 1, purpose: 1 }, { unique: true });

module.exports = mongoose.model('OtpRateLimit', otpRateLimitSchema);
