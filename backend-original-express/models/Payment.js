
const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    bookId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Book'
    },
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course'
    },
    // 'book' or 'course' — which of bookId/courseId is set for this payment
    itemType: {
        type: String,
        enum: ['book', 'course'],
        default: 'book'
    },
    downloadToken: {
        type: String,
        unique: true,
        sparse: true
    },
    downloadExpiresAt: Date,
    // User-initiated refund request (separate from the refund actually
    // being processed — admins action these from the Transactions panel)
    refundRequested: {
        type: Boolean,
        default: false
    },
    refundRequestedAt: Date,
    refundReason: String,
    // Optional UPI VPA the buyer entered on the checkout confirmation page
    upiId: String,
    downloadCount: {
        type: Number,
        default: 0
    },
    maxDownloads: {
        type: Number,
        default: 5
    },
    paymentGateway: {
        type: String,
        enum: ['PhonePe', 'Free'], 
    },
    // V2 uses merchantOrderId instead of merchantTransactionId
    merchantOrderId: {
        type: String,
        required: true,
        unique: true
    },
    phonePeOrderId: String, // PhonePe's internal order ID
    
    amount: {
        type: Number,
        required: true // Amount in paise
    },
    currency: {
        type: String,
        default: 'INR'
    },
    
    status: {
        type: String,
        enum: ['INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'],
        default: 'PENDING',
        index: true
    },
    
    paymentState: String, // Raw PhonePe state
    paymentMethod: String,
    paymentInstrument: mongoose.Schema.Types.Mixed,
    
    userMobile: String,
    userEmail: String,
    
    initiatedAt: {
        type: Date,
        default: Date.now
    },
    purchasedAt: {
        type: Date,
        default: Date.now
    },
    completedAt: Date,
    expireAt: Date,
    
    redirectUrl: String,
    
    webhookReceived: {
        type: Boolean,
        default: false
    },
    
    errorCode: String,
    errorMessage: String,
    
    refundId: String,
    refundAmount: Number,
    refundReason: String,
    refundedAt: Date

}, {
    timestamps: true
});

paymentSchema.pre('validate', function(next) {
    if (!this.bookId && !this.courseId) {
        return next(new Error('A payment must reference either a bookId or a courseId'));
    }
    next();
});

paymentSchema.index({ userId: 1, status: 1 });
paymentSchema.index({ createdAt: -1 });
module.exports = mongoose.model('Payment', paymentSchema);