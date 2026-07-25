const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
// const { sendOTPEmail } = require('../services/emailService');
// const otpService = require('../services/otpServices');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Generate JWT Token
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE
    });
};

// @route   POST /api/auth/google
// @desc    Log in or register a user via Google Sign-In (One Tap / GIS button)
//          Expects { credential } — the ID token returned by Google Identity Services.
exports.googleLogin = async (req, res) => {
    try {
        const { credential } = req.body;

        if (!credential) {
            return res.status(400).json({
                success: false,
                error: 'Missing Google credential'
            });
        }

        if (!process.env.GOOGLE_CLIENT_ID) {
            return res.status(500).json({
                success: false,
                error: 'Google Sign-In is not configured on the server'
            });
        }

        // Verify the ID token with Google
        let payload;
        try {
            const ticket = await googleClient.verifyIdToken({
                idToken: credential,
                audience: process.env.GOOGLE_CLIENT_ID
            });
            payload = ticket.getPayload();
        } catch (verifyError) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired Google credential'
            });
        }

        const { sub: googleId, email, name, picture, email_verified: emailVerified } = payload;

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Google account has no email address'
            });
        }

        // Find by googleId first, then fall back to matching email
        // (lets an existing password-based account link to Google)
        let user = await User.findOne({ googleId });

        if (!user) {
            user = await User.findOne({ email: email.toLowerCase() });

            if (user) {
                // Link existing local account to this Google identity
                user.googleId = googleId;
                user.authProvider = user.authProvider || 'google';
                if (!user.avatar && picture) user.avatar = picture;
                if (emailVerified) user.isVerified = true;
                await user.save();
            } else {
                // Brand new account via Google — no password/mobile required
                user = await User.create({
                    email: email.toLowerCase(),
                    fullName: name || email.split('@')[0],
                    googleId,
                    authProvider: 'google',
                    avatar: picture,
                    isVerified: !!emailVerified,
                    isActive: true
                });
            }
        }

        const token = jwt.sign(
            { id: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7h' }
        );

        res.cookie('auth_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/'
        });

        res.json({
            success: true,
            data: {
                _id: user._id,
                email: user.email,
                fullName: user.fullName,
                avatar: user.avatar,
                isAdmin: user.isAdmin,
                token
            }
        });
    } catch (error) {
        console.error('Google login error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @route   POST /api/auth/register
// @desc    Register a new user
exports.register = async (req, res) => {
    try {
        const { email, password, fullName, mobileNumber } = req.body;

        // Check if user exists
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({
                success: false,
                error: 'User already exists with this email'
            });
        }

        // Create user
        const user = await User.create({
            email,
            password,
            fullName,
            mobileNumber
        });

        // Generate token
        const token = generateToken(user._id);

        // Best-effort: send an email verification OTP right away. This must
        // never block or fail registration itself — if the mail provider is
        // down, the user can still request a new OTP later from their
        // account (subject to the same 5-per-24h send limit).
        try {
            const otpServices = require('../services/otpServices');
            const { sendOTPEmail } = require('../services/emailService');
            const limit = await otpServices.checkAndRegisterSend(user.email, 'email_verification');
            if (limit.allowed) {
                const otp = otpServices.generateOTP();
                await otpServices.storeOTP(user.email, otp, 'email_verification');
                await sendOTPEmail(user.email, otp, user.fullName, 'email_verification');
            }
        } catch (otpError) {
            console.error('Failed to send verification OTP on register:', otpError.message);
        }

        res.status(201).json({
            success: true,
            data: {
                _id: user._id,
                email: user.email,
                fullName: user.fullName,
                isAdmin: user.isAdmin,
                isVerified: user.isVerified,
                token
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @route   POST /api/auth/login
// @desc    Login user
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate email & password
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Please provide email and password'
            });
        }

        // Check for user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Generate token
        // const token = generateToken(user._id);
        const token = jwt.sign(
            { id: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7h' } // Long expiry for payment flow
        );

        // ✅ SET HTTP-ONLY COOKIE (survives redirects)
        res.cookie('auth_token', token, {
            httpOnly: true,        // Cannot be accessed by JavaScript (XSS protection)
            secure: process.env.NODE_ENV === 'production', // HTTPS only in production
            sameSite: 'lax',       // CSRF protection (allows redirects)
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: '/'
        });

        res.json({
            success: true,
            data: {
                _id: user._id,
                email: user.email,
                fullName: user.fullName,
                isAdmin: user.isAdmin,
                isVerified: user.isVerified,
                token
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @route   GET /api/auth/me
// @desc    Get current user
exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        
        res.json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @route   PUT /api/auth/update-profile
// @desc    Update user profile
exports.updateProfile = async (req, res) => {
    try {
        const userId = req.user._id;
        const { fullName, mobileNumber, interests } = req.body;

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Update fields
        if (fullName) user.fullName = fullName;
        if (mobileNumber) user.mobileNumber = mobileNumber;
        if (interests) user.interests = interests;

        await user.save();

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                _id: user._id,
                email: user.email,
                fullName: user.fullName,
                mobileNumber: user.mobileNumber,
                interests: user.interests,
                avatar: user.avatar,
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @route   PUT /api/auth/change-password
// @desc    Change password
exports.changePassword = async (req, res) => {
    try {
        const userId = req.user._id;
        const { currentPassword, newPassword } = req.body;

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Check current password
        const isMatch = await user.comparePassword(currentPassword);

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                error: 'Current password is incorrect'
            });
        }

        // Update password
        user.password = newPassword;
        await user.save();

        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};


// @desc    Delete a user
exports.deleteProfile = async (req, res) => {
    try {
        const { password, userId } = req.body;
        const profile = await User.findById(userId);
        if (!profile) {
            return res.status(404).json({
                success: false,
                error: 'Profile not found'
            });
        }

        // Check if user owns this rating
        if (User._id == userId.toString() && profile.password == password && !req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        await profile.deleteOne();

        res.json({
            success: true,
            message: 'Account deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

const otpServices = require('../services/otpServices');
const { sendOTPEmail } = require('../services/emailService');
const bcrypt = require('bcryptjs');

exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

        const user = await User.findOne({ email: email.toLowerCase() });

        // Always return success (don't reveal if email exists)
        if (!user) {
            return res.json({ success: true, message: 'If this email is registered, an OTP has been sent.' });
        }

        // Rate limit: don't resend if OTP already exists
        const exists = await otpServices.otpExists(email, 'password_reset');
        if (exists) {
            const remaining = await otpServices.getRemainingTime(email, 'password_reset');
            return res.status(429).json({
                success: false,
                error: `OTP already sent. Please wait ${remaining} seconds before requesting again.`
            });
        }

        // Rate limit: max 5 OTP sends per 24 hours for this email
        const limit = await otpServices.checkAndRegisterSend(email, 'password_reset');
        if (!limit.allowed) {
            return res.status(429).json({
                success: false,
                error: `You've reached the maximum of ${otpServices.MAX_SENDS_PER_WINDOW} password reset requests in 24 hours. Please try again in ${otpServices.formatRetryAfter(limit.retryAfterSeconds)}.`
            });
        }

        const otp = otpServices.generateOTP();
        await otpServices.storeOTP(email, otp, 'password_reset');
        await sendOTPEmail(email, otp, user.fullName, 'password_reset');

        res.json({ success: true, message: 'OTP sent to your email address.' });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ success: false, error: 'Failed to send OTP. Please try again.' });
    }
};

// STEP 2: Verify OTP
exports.verifyResetPassword = async (req, res) => {
     try {
        const { email, otp } = req.body;
        if (!email || !otp) return res.status(400).json({ success: false, error: 'Email and OTP are required' });

        const result = await otpServices.verifyOTP(email, otp, 'password_reset');
        if (!result.success) return res.status(400).json(result);

        // Don't delete OTP yet — delete only after password is reset
        res.json({ success: true, message: 'OTP verified. You can now reset your password.' });
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({ success: false, error: 'Verification failed. Please try again.' });
    }
};

// STEP 3: Reset Password with OTP
exports.resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        if (!email || !otp || !newPassword)
            return res.status(400).json({ success: false, error: 'All fields are required' });

        if (newPassword.length < 6)
            return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });

        // Re-verify OTP before resetting (security)
        const result = await otpServices.verifyOTP(email, otp, 'password_reset');
        if (!result.success) return res.status(400).json(result);

        const hashed = await bcrypt.hash(newPassword, 12);
        await User.findOneAndUpdate({ email: email.toLowerCase() }, { password: hashed });

        // Delete OTP after successful reset
        await otpServices.deleteOTP(email, 'password_reset');

        res.json({ success: true, message: 'Password reset successfully! You can now login.' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ success: false, error: 'Password reset failed. Please try again.' });
    }
};

// Resend OTP (forgot-password flow)
exports.resendOTP = async (req, res) => {
     try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        // Rate limit: max 5 OTP sends per 24 hours for this email. This was
        // previously missing entirely on this route — resend-otp force-deleted
        // and re-sent with no cap, which bypassed forgotPassword's own limit.
        const limit = await otpServices.checkAndRegisterSend(email, 'password_reset');
        if (!limit.allowed) {
            return res.status(429).json({
                success: false,
                error: `You've reached the maximum of ${otpServices.MAX_SENDS_PER_WINDOW} password reset requests in 24 hours. Please try again in ${otpServices.formatRetryAfter(limit.retryAfterSeconds)}.`
            });
        }

        // Force delete old OTP and send new one
        await otpServices.deleteOTP(email, 'password_reset');
        const otp = otpServices.generateOTP();
        await otpServices.storeOTP(email, otp, 'password_reset');

        await sendOTPEmail(email, otp, user.fullName, 'password_reset');

        res.json({ success: true, message: 'New OTP sent to your email.' });
    } catch (error) {
        console.error('Resend OTP error:', error);
        res.status(500).json({ success: false, error: 'Failed to resend OTP.' });
    }
};

// @route   POST /api/auth/send-email-otp
// @desc    Send (or resend) an email-confirmation OTP for the logged-out or
//          just-registered user. Rate limited to 5 sends / 24h per email.
exports.sendEmailVerificationOtp = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).json({ success: false, error: 'No account found with this email address' });

        if (user.isVerified) {
            return res.json({ success: true, alreadyVerified: true, message: 'This email is already verified.' });
        }

        const exists = await otpServices.otpExists(email, 'email_verification');
        if (exists) {
            const remaining = await otpServices.getRemainingTime(email, 'email_verification');
            return res.status(429).json({
                success: false,
                error: `OTP already sent. Please wait ${remaining} seconds before requesting again.`
            });
        }

        const limit = await otpServices.checkAndRegisterSend(email, 'email_verification');
        if (!limit.allowed) {
            return res.status(429).json({
                success: false,
                error: `You've reached the maximum of ${otpServices.MAX_SENDS_PER_WINDOW} verification emails in 24 hours. Please try again in ${otpServices.formatRetryAfter(limit.retryAfterSeconds)}.`
            });
        }

        const otp = otpServices.generateOTP();
        await otpServices.storeOTP(email, otp, 'email_verification');
        await sendOTPEmail(email, otp, user.fullName, 'email_verification');

        res.json({ success: true, message: 'A verification OTP has been sent to your email.', expiresIn: 600 });
    } catch (error) {
        console.error('Send email verification OTP error:', error);
        res.status(500).json({ success: false, error: 'Failed to send verification OTP. Please try again.' });
    }
};

// @route   POST /api/auth/verify-email-otp
// @desc    Confirm a user's email address using the OTP sent above.
exports.verifyEmailOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) return res.status(400).json({ success: false, error: 'Email and OTP are required' });

        const result = await otpServices.verifyOTP(email, otp, 'email_verification');
        if (!result.success) return res.status(400).json(result);

        await User.findOneAndUpdate({ email: email.toLowerCase() }, { isVerified: true });
        await otpServices.deleteOTP(email, 'email_verification');

        res.json({ success: true, message: 'Email verified successfully!' });
    } catch (error) {
        console.error('Verify email OTP error:', error);
        res.status(500).json({ success: false, error: 'Verification failed. Please try again.' });
    }
};

// STEP 1: Request Password Reset OTP
// exports.forgotPassword = async (req, res) => {
//     try {
//         const { email } = req.body;
//         if (!email) {
//             return res.status(400).json({
//                 success: false,
//                 error: 'Please provide an email address'
//             });
//         }

//         // Find user by email
//         const user = await User.findOne({ email: email.toLowerCase() });
//         if (!user) {
//             return res.status(404).json({
//                 success: false,
//                 error: 'No account found with this email address'
//             });
//         }

//         // Check if OTP already exists and is still valid
//         if (otpService.otpExists(email)) {
//             const remainingTime = otpService.getRemainingTime(email);
//             return res.status(400).json({
//                 success: false,
//                 error: `An OTP was already sent. Please wait ${Math.ceil(remainingTime / 60)} minutes before requesting a new one.`,
//                 remainingTime
//             });
//         }

//         // Generate OTP
//         const otp = otpService.generateOTP();
        
//         // Store OTP in memory (not in database)
//         otpService.storeOTP(email, otp);
//         // Send OTP email
//         try {
//             await sendOTPEmail(user.email, otp, user.fullName);
            
//             res.json({
//                 success: true,
//                 message: 'OTP has been sent to your email address. Valid for 10 minutes.',
//                 email: user.email,
//                 expiresIn: 600 // 10 minutes in seconds
//             });
//         } catch (emailError) {
//             // If email fails, remove OTP from memory
//             otpService.deleteOTP(email);
            
//             return res.status(500).json({
//                 success: false,
//                 error: 'Failed to send OTP email. Please try again later.'
//             });
//         }
//     } catch (error) {
//         console.error('Forgot password error:', error);
//         res.status(500).json({
//             success: false,
//             error: 'An error occurred while processing your request'
//         });
//     }
// };

// // STEP 2: Verify OTP
// exports.verifyResetPassword = async (req, res) => {
//     try {
//         const { email, otp } = req.body;

//         // Validate input
//         if (!email || !otp) {
//             return res.status(400).json({
//                 success: false,
//                 error: 'Please provide both email and OTP'
//             });
//         }

//         // Verify user exists
//         const user = await User.findOne({ email: email.toLowerCase() });
//         if (!user) {
//             return res.status(404).json({
//                 success: false,
//                 error: 'User not found'
//             });
//         }

//         // Verify OTP from memory
//         const verification = otpService.verifyOTP(email, otp);

//         if (!verification.success) {
//             return res.status(400).json({
//                 success: false,
//                 error: verification.error,
//                 attemptsLeft: verification.attemptsLeft
//             });
//         }

//         res.json({
//             success: true,
//             message: 'OTP verified successfully. You can now reset your password.',
//             email: user.email
//         });
//     } catch (error) {
//         console.error('Verify OTP error:', error);
//         res.status(500).json({
//             success: false,
//             error: 'An error occurred while verifying OTP'
//         });
//     }
// };

// // STEP 3: Reset Password with OTP
// exports.resetPassword = async (req, res) => {
//     try {
//         const { email, otp, newPassword, confirmPassword } = req.body;

//         // Validate input
//         if (!email || !otp || !newPassword || !confirmPassword) {
//             return res.status(400).json({
//                 success: false,
//                 error: 'Please provide all required fields'
//             });
//         }

//         if (newPassword !== confirmPassword) {
//             return res.status(400).json({
//                 success: false,
//                 error: 'Passwords do not match'
//             });
//         }

//         if (newPassword.length < 6) {
//             return res.status(400).json({
//                 success: false,
//                 error: 'Password must be at least 6 characters long'
//             });
//         }

//         // Find user
//         const user = await User.findOne({ email: email.toLowerCase() });
//         if (!user) {
//             return res.status(404).json({
//                 success: false,
//                 error: 'User not found'
//             });
//         }

//         // Verify OTP one final time
//         const verification = otpService.verifyOTP(email, otp);

//         if (!verification.success) {
//             return res.status(400).json({
//                 success: false,
//                 error: verification.error,
//                 attemptsLeft: verification.attemptsLeft
//             });
//         }

//         // Update password in database
//         user.password = newPassword;
//         await user.save();

//         // Delete OTP from memory after successful reset
//         otpService.deleteOTP(email);

//         res.json({
//             success: true,
//             message: 'Password has been reset successfully. You can now login with your new password.'
//         });
//     } catch (error) {
//         console.error('Reset password error:', error);
//         res.status(500).json({
//             success: false,
//             error: 'An error occurred while resetting your password'
//         });
//     }
// };

// // Resend OTP
// exports.resendOTP = async (req, res) => {
//     try {
//         const { email } = req.body;

//         if (!email) {
//             return res.status(400).json({
//                 success: false,
//                 error: 'Please provide an email address'
//             });
//         }

//         const user = await User.findOne({ email: email.toLowerCase() });

//         if (!user) {
//             return res.status(404).json({
//                 success: false,
//                 error: 'No account found with this email address'
//             });
//         }

//         // Check if OTP exists and is still valid
//         if (otpService.otpExists(email)) {
//             const remainingTime = otpService.getRemainingTime(email);
            
//             // Allow resend only if less than 2 minutes remaining
//             if (remainingTime > 120) {
//                 return res.status(400).json({
//                     success: false,
//                     error: `Please wait ${Math.ceil((remainingTime - 120) / 60)} more minutes before requesting a new OTP.`,
//                     remainingTime
//                 });
//             }
//         }

//         // Delete old OTP
//         otpService.deleteOTP(email);

//         // Generate new OTP
//         const otp = otpService.generateOTP();
//         otpService.storeOTP(email, otp);

//         // Send OTP email
//         try {
//             await sendOTPEmail(user.email, otp, user.name);
            
//             res.json({
//                 success: true,
//                 message: 'New OTP has been sent to your email address',
//                 expiresIn: 600
//             });
//         } catch (emailError) {
//             otpService.deleteOTP(email);
//             return res.status(500).json({
//                 success: false,
//                 error: 'Failed to send OTP email. Please try again later.'
//             });
//         }
//     } catch (error) {
//         console.error('Resend OTP error:', error);
//         res.status(500).json({
//             success: false,
//             error: 'An error occurred while resending OTP'
//         });
//     }
// };
