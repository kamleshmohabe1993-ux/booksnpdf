const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');

// Import all controller functions
const {
    initiatePayment,
    initiateCoursePayment,
    getPaymentHistory,
    handleWebhook,
    handleRedirectCallback,
    getPaymentStatus,
    initiateRefund,
    requestRefund,
    getDownloadLink,
    freeDownload,
    freeCourseDownload,
    getMyPurchases,
    getAllTransactions,
    getTransactionById,
    getTransactionStats,
    updateTransactionStatus,
    exportTransactions,
    deleteTransaction,
    cleanupFailedTransactions,
    bulkDeleteTransactions
} = require('../controllers/paymentController');

// Public routes
router.post('/webhook', handleWebhook); // PhonePe webhook (no auth)

// UI Redirect: Browser redirect after payment (no auth middleware)
router.get('/redirect-callback', handleRedirectCallback);

// Status polling: Called by frontend (requires auth)
router.get('/status/:merchantOrderId', protect, getPaymentStatus);


// Protected routes (require authentication)
router.post('/initiate', protect, initiatePayment);
router.post('/initiate-course', protect, initiateCoursePayment);
// router.get('/status/:transactionId', protect, checkPaymentStatus);
router.post('/downloadfree/:bookId', protect, freeDownload);
router.post('/downloadfree-course/:courseId', protect, freeCourseDownload);
router.get('/my-purchases', protect, getMyPurchases);
router.post('/:paymentId/request-refund', protect, requestRefund);

// router.get('/verify/:merchantOrderId', protect, checkPaymentStatus);
router.get('/history', protect, getPaymentHistory);
router.post('/refund/:merchantOrderId', protect, adminOnly, initiateRefund);

// Admin transaction routes
router.get('/transactions', protect, adminOnly, getAllTransactions);
router.get('/transactions/:id', protect, adminOnly, getTransactionById);
router.get('/stats', protect, adminOnly, getTransactionStats);
router.put('/transactions/:id/status', protect, adminOnly, updateTransactionStatus);
router.get('/export', protect, adminOnly, exportTransactions);

// Token-based download (no auth required, token acts as auth)
router.get('/download/:token', getDownloadLink);

// Admin only routes
// router.post('/refund', protect, adminOnly, initiateRefund);

// ============================================
// TRANSACTION DELETE ROUTES (Admin Only)
// ============================================
router.delete(
    '/transactions/:id',
    protect, adminOnly,
    deleteTransaction
);

// @route   POST /api/payments/admin/transactions/bulk-delete
// @desc    Bulk delete multiple transactions
// @access  Private (Admin)
router.post(
    '/transactions/bulk-delete',
    protect, adminOnly,
    bulkDeleteTransactions
);

// @route   DELETE /api/payments/admin/transactions/cleanup
// @desc    Cleanup old failed transactions
// @access  Private (Admin)
// @query   ?daysOld=30 (default: 30 days)
router.delete(
    '/cleanup',
    protect, adminOnly,
    cleanupFailedTransactions
);
module.exports = router;

// backend/routes/payments.js

// const express = require('express');
// const router = express.Router();
// const { protect } = require('../middleware/auth'); // Your auth middleware
// const {
//     initiatePayment,
//     paytmCallback,
//     checkPaymentStatus,
//     freeDownload
// } = require('../controllers/paymentController');

// // @route   POST /api/payments/initiate
// // @desc    Initiate Paytm payment
// // @access  Private
// router.post('/initiate', protect, initiatePayment);

// // @route   POST /api/payments/paytm/callback
// // @desc    Handle Paytm callback
// // @access  Public (Paytm will call this)
// router.post('/paytm/callback', paytmCallback);

// // @route   POST /api/payments/status
// // @desc    Check payment status
// // @access  Private
// router.post('/status', protect, checkPaymentStatus);

// // @route   POST /api/payments/free-download
// // @desc    Download free book
// // @access  Private
// router.post('/free-download', protect, freeDownload);

// module.exports = router;