// Add this to your existing paymentController.js

// @route   DELETE /api/payments/admin/transactions/:id
// @desc    Delete a transaction (Admin only - use with extreme caution)
// @access  Private (Admin)
exports.deleteTransaction = async (req, res) => {
    try {
        // Verify admin access
        if (!req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Admin privileges required.'
            });
        }

        const transactionId = req.params.id;

        console.log('🗑️ Attempting to delete transaction:', transactionId);

        // Find the transaction
        const transaction = await Purchase.findById(transactionId)
            .populate('user', 'fullName email')
            .populate('book', 'title');

        if (!transaction) {
            return res.status(404).json({
                success: false,
                error: 'Transaction not found'
            });
        }

        // Check if transaction can be deleted
        // Only allow deletion of FAILED or PENDING transactions by default
        const deletableStatuses = ['FAILED', 'PENDING'];
        
        if (!deletableStatuses.includes(transaction.paymentStatus)) {
            // For COMPLETED or REFUNDED transactions, require additional confirmation
            // You might want to add a query parameter like ?force=true
            const forceDelete = req.query.force === 'true';
            
            if (!forceDelete) {
                return res.status(400).json({
                    success: false,
                    error: `Cannot delete ${transaction.paymentStatus} transaction without force flag. This transaction has been completed.`,
                    data: {
                        transactionId: transaction.transactionId,
                        status: transaction.paymentStatus,
                        amount: transaction.amount,
                        user: transaction.user?.fullName,
                        book: transaction.book?.title,
                        requiresForce: true
                    }
                });
            }
        }

        // Log deletion for audit purposes
        console.log('⚠️ TRANSACTION DELETE:', {
            deletedBy: req.user.email,
            transactionId: transaction.transactionId,
            status: transaction.paymentStatus,
            amount: transaction.amount,
            user: transaction.user?.email,
            book: transaction.book?.title,
            deletedAt: new Date().toISOString()
        });

        // If transaction was COMPLETED, we need to reverse the book download count
        if (transaction.paymentStatus === 'COMPLETED' && transaction.book) {
            await Book.findByIdAndUpdate(
                transaction.book._id,
                { $inc: { downloadCount: -1 } }
            );
            console.log('✅ Reversed book download count');
        }

        // Store transaction data before deletion (for logging/audit)
        const deletedTransactionData = {
            _id: transaction._id,
            transactionId: transaction.transactionId,
            user: transaction.user?.email,
            book: transaction.book?.title,
            amount: transaction.amount,
            paymentStatus: transaction.paymentStatus,
            paymentGateway: transaction.paymentGateway,
            purchasedAt: transaction.purchasedAt,
            deletedBy: req.user.email,
            deletedAt: new Date()
        };

        // Optional: Store in a deletedTransactions collection for audit trail
        // await DeletedTransaction.create(deletedTransactionData);

        // Delete the transaction
        await transaction.deleteOne();

        console.log('✅ Transaction deleted successfully');

        res.json({
            success: true,
            message: 'Transaction deleted successfully',
            data: {
                deletedTransaction: deletedTransactionData
            }
        });

    } catch (error) {
        console.error('❌ Delete transaction error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete transaction: ' + error.message
        });
    }
};

// @route   POST /api/payments/admin/transactions/bulk-delete
// @desc    Bulk delete transactions (Admin only)
// @access  Private (Admin)
exports.bulkDeleteTransactions = async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Admin privileges required.'
            });
        }

        const { transactionIds, force } = req.body;

        if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid transaction IDs array'
            });
        }

        console.log('🗑️ Bulk delete request:', {
            count: transactionIds.length,
            force: force
        });

        // Find all transactions
        const transactions = await Purchase.find({ 
            _id: { $in: transactionIds } 
        }).populate('book', 'title');

        if (transactions.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No transactions found'
            });
        }

        // Check if any transactions are COMPLETED or REFUNDED
        const protectedTransactions = transactions.filter(t => 
            t.paymentStatus === 'COMPLETED' || t.paymentStatus === 'REFUNDED'
        );

        if (protectedTransactions.length > 0 && !force) {
            return res.status(400).json({
                success: false,
                error: `${protectedTransactions.length} transaction(s) are COMPLETED or REFUNDED and require force delete`,
                data: {
                    protectedCount: protectedTransactions.length,
                    totalCount: transactions.length,
                    requiresForce: true
                }
            });
        }

        // Reverse book download counts for COMPLETED transactions
        const completedTransactions = transactions.filter(t => t.paymentStatus === 'COMPLETED');
        for (const transaction of completedTransactions) {
            if (transaction.book) {
                await Book.findByIdAndUpdate(
                    transaction.book._id,
                    { $inc: { downloadCount: -1 } }
                );
            }
        }

        // Log bulk deletion
        console.log('⚠️ BULK TRANSACTION DELETE:', {
            deletedBy: req.user.email,
            count: transactions.length,
            deletedAt: new Date().toISOString()
        });

        // Delete all transactions
        const result = await Purchase.deleteMany({ 
            _id: { $in: transactionIds } 
        });

        console.log(`✅ Bulk deleted ${result.deletedCount} transactions`);

        res.json({
            success: true,
            message: `${result.deletedCount} transaction(s) deleted successfully`,
            data: {
                deletedCount: result.deletedCount
            }
        });

    } catch (error) {
        console.error('❌ Bulk delete error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete transactions: ' + error.message
        });
    }
};

// @route   DELETE /api/payments/admin/transactions/cleanup
// @desc    Delete all FAILED transactions older than X days (Admin only)
// @access  Private (Admin)
exports.cleanupFailedTransactions = async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        const { daysOld = 30 } = req.query;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - parseInt(daysOld));

        console.log('🧹 Cleaning up failed transactions older than:', cutoffDate);

        // Find failed transactions older than cutoff date
        const failedTransactions = await Purchase.find({
            paymentStatus: 'FAILED',
            purchasedAt: { $lt: cutoffDate }
        });

        if (failedTransactions.length === 0) {
            return res.json({
                success: true,
                message: 'No failed transactions to clean up',
                data: {
                    deletedCount: 0
                }
            });
        }

        // Delete them
        const result = await Purchase.deleteMany({
            paymentStatus: 'FAILED',
            purchasedAt: { $lt: cutoffDate }
        });

        console.log(`✅ Cleaned up ${result.deletedCount} failed transactions`);

        res.json({
            success: true,
            message: `Cleaned up ${result.deletedCount} failed transaction(s)`,
            data: {
                deletedCount: result.deletedCount,
                cutoffDate
            }
        });

    } catch (error) {
        console.error('❌ Cleanup error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};