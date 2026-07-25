const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        lowercase: true,
        index: true
    },
    // Which flow this OTP belongs to. Keeping separate purposes means a
    // "verify my email" OTP and a "reset my password" OTP requested around
    // the same time for the same address don't overwrite each other.
    purpose: {
        type: String,
        enum: ['password_reset', 'email_verification'],
        default: 'password_reset',
        index: true
    },
    otp: {
        type: String,
        required: true
    },
    attempts: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 600 // auto-delete after 10 min
    }
});

otpSchema.index({ email: 1, purpose: 1 });

module.exports = mongoose.model('OTP', otpSchema);