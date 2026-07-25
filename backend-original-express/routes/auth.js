const express = require('express');
const router = express.Router();
const { 
    register, 
    login, 
    googleLogin,
    getMe, 
    updateProfile, 
    deleteProfile, 
    changePassword,
    forgotPassword, 
    verifyResetPassword,
    resetPassword, 
    resendOTP,
    sendEmailVerificationOtp,
    verifyEmailOtp
 } = require('../controllers/authController');
const { 
    getAllUsers,
    getUserStats,
    exportUsers,
    getUserById,
    toggleUserStatus,
    verifyUser,
    deleteUser,
    bulkUserAction
 } = require('../controllers/userController');

const { protect, adminOnly } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.post('/google', googleLogin);
router.post('/forgot-password', forgotPassword);
router.post('/verify-reset-otp', verifyResetPassword);
router.post('/resend-otp', resendOTP);
router.post('/reset-password', resetPassword);
router.post('/send-email-otp', sendEmailVerificationOtp);
router.post('/verify-email-otp', verifyEmailOtp);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.delete('/account', protect, deleteProfile);
router.put('/change-password', protect, changePassword);

// Admin Users Data routes
router.get('/users', protect, adminOnly, getAllUsers);
router.get('/userstats', protect, adminOnly, getUserStats);
router.get('/exportusers', protect, adminOnly, exportUsers);
router.get('/:id', protect, adminOnly, getUserById);
router.put('/:id/toggle-status', protect, adminOnly, toggleUserStatus);
router.put('/:id/verify', protect, adminOnly, verifyUser);
router.delete('/:id', protect, adminOnly, deleteUser);
router.post('/bulk-action', protect, adminOnly, bulkUserAction);

module.exports = router;