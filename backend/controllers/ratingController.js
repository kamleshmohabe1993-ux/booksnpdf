const Rating = require('../models/Rating');
const Book = require('../models/Book');
const mongoose = require('mongoose');
// @route   POST /api/ratings
// @desc    Add or update a rating
exports.addRating = async (req, res) => {
    try {
        const { bookId, rating, review } = req.body;
        const userId = req.user._id;

        // Validate rating
        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                error: 'Rating must be between 1 and 5'
            });
        }

        // Check if book exists
        const book = await Book.findById(bookId);
        if (!book) {
            return res.status(404).json({
                success: false,
                error: 'Book not found'
            });
        }

        // Check if user already rated this book
        let existingRating = await Rating.findOne({ user: userId, book: bookId });

        if (existingRating) {
            // Update existing rating
            const oldRating = existingRating.rating;
            existingRating.rating = rating;
            existingRating.review = review || existingRating.review;
            existingRating.updatedAt = Date.now();
            await existingRating.save();

            // Update book's average rating
            const totalRatings = await Rating.countDocuments({ book: bookId });
            const ratings = await Rating.find({ book: bookId });
            const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
            book.averageRating = sum / totalRatings;
            await book.save();

            return res.json({
                success: true,
                message: 'Rating updated successfully',
                data: existingRating
            });
        } else {
            // Create new rating
            const newRating = await Rating.create({
                user: userId,
                book: bookId,
                rating,
                review
            });

            // Update book's rating stats
            book.totalRatings += 1;
            const ratings = await Rating.find({ book: bookId });
            const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
            book.averageRating = sum / ratings.length;
            await book.save();

            return res.status(201).json({
                success: true,
                message: 'Rating added successfully',
                data: newRating
            });
        }
    } catch (error) {
        console.error('Add rating error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @route   GET /api/ratings/:bookId
// @desc    Get all ratings for a book
exports.getBookRatings = async (req, res) => {
    try {
        const { bookId } = req.params;
        const { page = 1, limit = 10 } = req.query;

        const ratings = await Rating.find({ book: bookId })
            .populate('user', 'fullName')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);
        const total = await Rating.countDocuments({ book: bookId });

        // Get rating distribution
        const distribution = await Rating.aggregate([
            { $match: { book: new mongoose.Types.ObjectId(bookId) } },
            { $group: { _id: '$rating', count: { $sum: 1 } } },
            { $sort: { _id: -1 } }
        ]);
        res.json({
            success: true,
            data: {
                ratings,
                pagination: {
                    total,
                    page: parseInt(page),
                    pages: Math.ceil(total / limit)
                },
                distribution
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @route   GET /api/ratings/user/:bookId
// @desc    Get user's rating for a book
exports.getUserRating = async (req, res) => {
    try {
        const { bookId } = req.params;
        const userId = req.user._id;

        const rating = await Rating.findOne({ user: userId, book: bookId });

        res.json({
            success: true,
            data: rating
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @route   DELETE /api/ratings/:ratingId
// @desc    Delete a rating
exports.deleteRating = async (req, res) => {
    try {
        const { ratingId } = req.params;
        const userId = req.user._id;

        const rating = await Rating.findById(ratingId);

        if (!rating) {
            return res.status(404).json({
                success: false,
                error: 'Rating not found'
            });
        }

        // Check if user owns this rating
        if (rating.user.toString() !== userId.toString() && !req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        await rating.deleteOne();

        // Update book's rating stats
        const book = await Book.findById(rating.book);
        if (book) {
            book.totalRatings = Math.max(0, book.totalRatings - 1);
            
            if (book.totalRatings === 0) {
                book.averageRating = 0;
            } else {
                const ratings = await Rating.find({ book: rating.book });
                const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
                book.averageRating = sum / ratings.length;
            }
            
            await book.save();
        }

        res.json({
            success: true,
            message: 'Rating deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};