// controllers/userController.js
const User = require('../models/User');
const Purchase = require('../models/Purchase');
const Book = require('../models/Book');

// @route   GET /api/users/admin/all
// @desc    Get all registered users with stats (Admin only)
// @access  Private (Admin)
exports.getAllUsers = async (req, res) => {
    try {
        // Verify admin access
        if (!req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Admin privileges required.'
            });
        }

        const { 
            status, 
            verified, 
            search, 
            sortBy = 'recent',
            page = 1,
            limit = 50 
        } = req.query;

        console.log('📊 Fetching users with filters:', { status, verified, search, sortBy });

        // Build query
        let query = {};
        
        // Status filter
        if (status && status !== 'all') {
            query.isActive = status === 'active';
        }
        
        // Verification filter
        if (verified && verified !== 'all') {
            query.isVerified = verified === 'verified';
        }
        
        // Search filter
        if (search && search.trim() !== '') {
            query.$or = [
                { fullName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { mobileNumber: { $regex: search, $options: 'i' } }
            ];
        }

        // Sorting logic
        let sortOption = {};
        switch(sortBy) {
            case 'recent':
                sortOption = { createdAt: -1 };
                break;
            case 'oldest':
                sortOption = { createdAt: 1 };
                break;
            case 'name':
                sortOption = { fullName: 1 };
                break;
            case 'purchases':
                // Will sort after aggregation
                sortOption = { createdAt: -1 };
                break;
            default:
                sortOption = { createdAt: -1 };
        }

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Fetch users with pagination
        const users = await User.find(query)
            .select('-password -otp -otpExpires -__v')
            .sort(sortOption)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        // Get total count for pagination
        const totalUsers = await User.countDocuments(query);

        console.log(`✅ Found ${users.length} users out of ${totalUsers} total`);

        // Get purchase statistics for each user using aggregation
        const userIds = users.map(user => user._id);
        
        const purchaseStats = await Purchase.aggregate([
            {
                $match: {
                    user: { $in: userIds },
                    paymentStatus: 'COMPLETED'
                }
            },
            {
                $group: {
                    _id: '$user',
                    purchaseCount: { $sum: 1 },
                    totalSpent: { $sum: '$amount' }
                }
            }
        ]);

        // Create a map for quick lookup
        const statsMap = {};
        purchaseStats.forEach(stat => {
            statsMap[stat._id.toString()] = {
                purchaseCount: stat.purchaseCount,
                totalSpent: stat.totalSpent
            };
        });

        // Merge users with their stats
        const usersWithStats = users.map(user => ({
            ...user,
            purchaseCount: statsMap[user._id.toString()]?.purchaseCount || 0,
            totalSpent: statsMap[user._id.toString()]?.totalSpent || 0
        }));

        // Sort by purchases if requested
        if (sortBy === 'purchases') {
            usersWithStats.sort((a, b) => b.purchaseCount - a.purchaseCount);
        }

        // Calculate overall statistics
        const allUsers = await User.find({}).lean();
        const allPurchases = await Purchase.find({ paymentStatus: 'COMPLETED' });

        const stats = {
            total: allUsers.length,
            active: allUsers.filter(u => u.isActive).length,
            inactive: allUsers.filter(u => !u.isActive).length,
            verified: allUsers.filter(u => u.isVerified).length,
            unverified: allUsers.filter(u => !u.isVerified).length,
            totalRevenue: allPurchases.reduce((sum, p) => sum + (p.amount || 0), 0)
        };

        res.json({
            success: true,
            count: usersWithStats.length,
            total: totalUsers,
            page: parseInt(page),
            pages: Math.ceil(totalUsers / parseInt(limit)),
            stats,
            data: usersWithStats
        });

    } catch (error) {
        console.error('❌ Get users error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch users: ' + error.message
        });
    }
};

// @route   GET /api/users/admin/:id
// @desc    Get single user details with complete stats (Admin only)
// @access  Private (Admin)
exports.getUserById = async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Admin privileges required.'
            });
        }

        const userId = req.params.id;

        // Find user
        const user = await User.findById(userId)
            .select('-password -otp -otpExpires')
            .lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Get user's purchases
        const purchases = await Purchase.find({ 
            user: userId,
            paymentStatus: 'COMPLETED' 
        })
            .populate('book', 'title thumbnail price category')
            .sort({ purchasedAt: -1 })
            .lean();

        // Calculate stats
        const stats = {
            purchaseCount: purchases.length,
            totalSpent: purchases.reduce((sum, p) => sum + p.amount, 0),
            freeDownloads: purchases.filter(p => p.paymentGateway === 'Free').length,
            paidPurchases: purchases.filter(p => p.paymentGateway !== 'Free').length
        };

        // Get user's activity summary
        const recentActivity = await Purchase.find({ user: userId })
            .sort({ purchasedAt: -1 })
            .limit(10)
            .populate('book', 'title')
            .lean();

        res.json({
            success: true,
            data: {
                ...user,
                stats,
                purchases,
                recentActivity
            }
        });

    } catch (error) {
        console.error('Get user by ID error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @route   PUT /api/users/admin/:id/toggle-status
// @desc    Toggle user active/inactive status (Admin only)
// @access  Private (Admin)
exports.toggleUserStatus = async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Admin privileges required.'
            });
        }

        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Prevent admin from deactivating themselves
        if (user._id.toString() === req.user._id.toString()) {
            return res.status(400).json({
                success: false,
                error: 'Cannot deactivate your own account'
            });
        }

        // Toggle status
        user.isActive = !user.isActive;
        await user.save();

        console.log(`✅ User ${user.email} ${user.isActive ? 'activated' : 'deactivated'}`);

        res.json({
            success: true,
            message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
            data: {
                _id: user._id,
                fullName: user.fullName,
                email: user.email,
                isActive: user.isActive
            }
        });

    } catch (error) {
        console.error('Toggle status error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @route   PUT /api/users/admin/:id/verify
// @desc    Manually verify user (Admin only)
// @access  Private (Admin)
exports.verifyUser = async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Admin privileges required.'
            });
        }

        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        if (user.isVerified) {
            return res.status(400).json({
                success: false,
                error: 'User is already verified'
            });
        }

        user.isVerified = true;
        await user.save();

        console.log(`✅ User ${user.email} manually verified by admin`);

        res.json({
            success: true,
            message: 'User verified successfully',
            data: {
                _id: user._id,
                fullName: user.fullName,
                email: user.email,
                isVerified: user.isVerified
            }
        });

    } catch (error) {
        console.error('Verify user error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @route   DELETE /api/users/admin/:id
// @desc    Delete user account (Admin only - use with caution)
// @access  Private (Admin)
exports.deleteUser = async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Admin privileges required.'
            });
        }

        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Prevent admin from deleting themselves
        if (user._id.toString() === req.user._id.toString()) {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete your own account'
            });
        }

        // Check if user has active purchases
        const activePurchases = await Purchase.countDocuments({
            user: user._id,
            paymentStatus: 'COMPLETED'
        });

        if (activePurchases > 0) {
            return res.status(400).json({
                success: false,
                error: `Cannot delete user with ${activePurchases} active purchases. Deactivate instead.`
            });
        }

        // Delete user and their data
        await Purchase.deleteMany({ user: user._id });
        await user.deleteOne();

        console.log(`🗑️ User ${user.email} deleted by admin`);

        res.json({
            success: true,
            message: 'User deleted successfully'
        });

    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @route   GET /api/users/admin/stats
// @desc    Get detailed user statistics (Admin only)
// @access  Private (Admin)
exports.getUserStats = async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        const { startDate, endDate } = req.query;

        // Build date filter
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
        }

        // Get all users
        const users = await User.find(dateFilter).lean();
        const allPurchases = await Purchase.find({ paymentStatus: 'COMPLETED' });

        // User registration trends (last 12 months)
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

        const registrationTrends = await User.aggregate([
            {
                $match: {
                    createdAt: { $gte: twelveMonthsAgo }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { '_id.year': 1, '_id.month': 1 }
            }
        ]);

        // Top spending users
        const topSpenders = await Purchase.aggregate([
            {
                $match: { paymentStatus: 'COMPLETED' }
            },
            {
                $group: {
                    _id: '$user',
                    totalSpent: { $sum: '$amount' },
                    purchaseCount: { $sum: 1 }
                }
            },
            {
                $sort: { totalSpent: -1 }
            },
            {
                $limit: 10
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'userDetails'
                }
            },
            {
                $unwind: '$userDetails'
            },
            {
                $project: {
                    fullName: '$userDetails.fullName',
                    email: '$userDetails.email',
                    totalSpent: 1,
                    purchaseCount: 1
                }
            }
        ]);

        const stats = {
            overview: {
                total: users.length,
                active: users.filter(u => u.isActive).length,
                inactive: users.filter(u => !u.isActive).length,
                verified: users.filter(u => u.isVerified).length,
                unverified: users.filter(u => !u.isVerified).length,
                admins: users.filter(u => u.isAdmin).length
            },
            revenue: {
                totalRevenue: allPurchases.reduce((sum, p) => sum + p.amount, 0),
                averageRevenuePerUser: users.length > 0 
                    ? (allPurchases.reduce((sum, p) => sum + p.amount, 0) / users.length).toFixed(2)
                    : 0
            },
            registrationTrends,
            topSpenders,
            recentUsers: await User.find()
                .sort({ createdAt: -1 })
                .limit(5)
                .select('fullName email createdAt isVerified isActive')
                .lean()
        };

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        console.error('Get user stats error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @route   POST /api/users/admin/bulk-action
// @desc    Perform bulk actions on users (Admin only)
// @access  Private (Admin)
exports.bulkUserAction = async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        const { userIds, action } = req.body;

        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid user IDs array'
            });
        }

        let updateOperation = {};
        let actionMessage = '';

        switch (action) {
            case 'activate':
                updateOperation = { isActive: true };
                actionMessage = 'activated';
                break;
            case 'deactivate':
                updateOperation = { isActive: false };
                actionMessage = 'deactivated';
                break;
            case 'verify':
                updateOperation = { isVerified: true };
                actionMessage = 'verified';
                break;
            default:
                return res.status(400).json({
                    success: false,
                    error: 'Invalid action'
                });
        }

        // Prevent admin from deactivating themselves
        const filteredUserIds = userIds.filter(id => id !== req.user._id.toString());

        const result = await User.updateMany(
            { _id: { $in: filteredUserIds } },
            { $set: updateOperation }
        );

        console.log(`✅ Bulk action: ${result.modifiedCount} users ${actionMessage}`);

        res.json({
            success: true,
            message: `${result.modifiedCount} users ${actionMessage} successfully`,
            data: {
                modifiedCount: result.modifiedCount
            }
        });

    } catch (error) {
        console.error('Bulk action error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @route   GET /api/users/admin/export
// @desc    Export users to CSV (Admin only)
// @access  Private (Admin)
exports.exportUsers = async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        const { status, verified, startDate, endDate } = req.query;

        // Build query
        let query = {};
        
        if (status && status !== 'all') {
            query.isActive = status === 'active';
        }
        
        if (verified && verified !== 'all') {
            query.isVerified = verified === 'verified';
        }
        
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const users = await User.find(query)
            .select('-password -otp -otpExpires')
            .sort({ createdAt: -1 })
            .lean();

        // Get purchase stats
        const userIds = users.map(u => u._id);
        const purchaseStats = await Purchase.aggregate([
            {
                $match: {
                    user: { $in: userIds },
                    paymentStatus: 'COMPLETED'
                }
            },
            {
                $group: {
                    _id: '$user',
                    purchaseCount: { $sum: 1 },
                    totalSpent: { $sum: '$amount' }
                }
            }
        ]);

        const statsMap = {};
        purchaseStats.forEach(stat => {
            statsMap[stat._id.toString()] = stat;
        });

        // Sanitize CSV values
        const sanitizeCSV = (value) => {
            const str = String(value || '');
            if (str.startsWith('=') || str.startsWith('+') || 
                str.startsWith('-') || str.startsWith('@')) {
                return `'${str}`;
            }
            return `"${str.replace(/"/g, '""')}"`;
        };

        // Create CSV
        const csvHeader = 'ID,Name,Email,Mobile,Status,Verified,Role,Purchases,Total Spent,Last Login,Joined Date\n';
        const csvRows = users.map(user => {
            const stats = statsMap[user._id.toString()] || { purchaseCount: 0, totalSpent: 0 };
            return [
                sanitizeCSV(user._id),
                sanitizeCSV(user.fullName),
                sanitizeCSV(user.email),
                sanitizeCSV(user.mobileNumber),
                sanitizeCSV(user.isActive ? 'Active' : 'Inactive'),
                sanitizeCSV(user.isVerified ? 'Yes' : 'No'),
                sanitizeCSV(user.isAdmin ? 'Admin' : 'User'),
                sanitizeCSV(stats.purchaseCount),
                sanitizeCSV(stats.totalSpent),
                sanitizeCSV(user.lastLogin ? new Date(user.lastLogin).toISOString() : 'Never'),
                sanitizeCSV(new Date(user.createdAt).toISOString())
            ].join(',');
        }).join('\n');

        const csv = csvHeader + csvRows;

        // Set headers for file download
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=users-export-${Date.now()}.csv`);
        res.send(csv);

    } catch (error) {
        console.error('Export users error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};