const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    book: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Book',
        required: true
    },
    transactionId: {
        type: String,
        required: true,
        unique: true
    },
    amount: {
        type: Number,
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'],
        default: 'PENDING'
    },
    paymentGateway: {
        type: String,
        enum: ['PhonePe', 'Free', 'Paytm'], 
    },
    phonepeResponse: {
        type: Object
    },
    downloadToken: {
        type: String,
        unique: true,
        sparse: true
    },
    downloadExpiresAt: {
        type: Date
    },
    downloadCount: {
        type: Number,
        default: 0
    },
    maxDownloads: {
        type: Number,
        default: 5
    },
    refundTransactionId: {
        type: String
    },
    refundedAt: {
        type: Date
    },
    purchasedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for faster queries (transactionId and downloadToken already get an
// index from `unique: true` above — declaring both trips a Mongoose warning).
purchaseSchema.index({ user: 1, book: 1 });

module.exports = mongoose.model('Purchase', purchaseSchema);

// backend/models/Purchase.js

// const mongoose = require('mongoose');

// const purchaseSchema = new mongoose.Schema({
//     user: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'User',
//         required: true,
//         index: true
//     },
//     book: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Book',
//         required: true,
//         index: true
//     },
//     transactionId: {
//         type: String,
//         required: true,
//         unique: true,
//         index: true
//     },
//     orderId: {
//         type: String,
//         unique: true,
//         sparse: true, // Allows null values for free books
//         index: true
//     },
//     amount: {
//         type: Number,
//         required: true,
//         min: 0
//     },
//     paymentStatus: {
//         type: String,
//         enum: ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'],
//         default: 'PENDING',
//         index: true
//     },
//     paymentGateway: {
//         type: String,
//         enum: ['PhonePe', 'Free', 'Paytm'], // FIXED: Correct enum values
//         required: true
//     },
    
//     // Paytm specific fields
//     paytmTransactionToken: {
//         type: String
//     },
//     paytmTxnId: {
//         type: String,
//         index: true
//     },
//     paytmResponse: {
//         type: mongoose.Schema.Types.Mixed
//     },
    
//     // Download management
//     downloadToken: {
//         type: String,
//         unique: true,
//         sparse: true
//     },
//     downloadCount: {
//         type: Number,
//         default: 0
//     },
//     lastDownloadAt: {
//         type: Date
//     },
    
//     // Timestamps
//     paidAt: {
//         type: Date
//     },
//     failureReason: {
//         type: String
//     }
// }, {
//     timestamps: true
// });

// // Indexes for better query performance
// purchaseSchema.index({ user: 1, book: 1 });
// purchaseSchema.index({ user: 1, paymentStatus: 1 });
// purchaseSchema.index({ transactionId: 1 });
// purchaseSchema.index({ orderId: 1 });
// purchaseSchema.index({ createdAt: -1 });

// // Virtual for checking if purchase is completed
// purchaseSchema.virtual('isCompleted').get(function() {
//     return this.paymentStatus === 'COMPLETED';
// });

// // Method to check if download is allowed
// purchaseSchema.methods.canDownload = function() {
//     return this.paymentStatus === 'COMPLETED' && this.downloadToken;
// };

// // Method to increment download count
// purchaseSchema.methods.recordDownload = async function() {
//     this.downloadCount += 1;
//     this.lastDownloadAt = new Date();
//     return await this.save();
// };

// // Static method to find user's purchases
// purchaseSchema.statics.findUserPurchases = function(userId, status = null) {
//     const query = { user: userId };
//     if (status) {
//         query.paymentStatus = status;
//     }
//     return this.find(query)
//         .populate('book')
//         .sort({ createdAt: -1 });
// };

// // Static method to check if user purchased a book
// purchaseSchema.statics.hasPurchased = async function(userId, bookId) {
//     const purchase = await this.findOne({
//         user: userId,
//         book: bookId,
//         paymentStatus: 'COMPLETED'
//     });
//     return !!purchase;
// };

// module.exports = mongoose.model('Purchase', purchaseSchema);