const mongoose = require('mongoose');
const Book = require('../models/Book');
const { processImage, validateImage } = require('../utils/imageHelper');
const { getAssetDownloadLink, isValidAssetLink } = require('../utils/driveHelper');

const SORT_MAP = {
    newest: { createdAt: -1 },
    popular: { downloadCount: -1 },
    rating: { averageRating: -1 },
    'price-low': { price: 1 },
    'price-high': { price: -1 }
};

// @route   GET /api/books
// @desc    Get all books
exports.getAllBooks = async (req, res) => {
    try {
        const { search, category, isPaid, featured, sort, limit } = req.query;

        let query = { isActive: true };

        // Search filter
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { author: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        // Category filter
        if (category) {
            query.category = category;
        }

        // Paid/Free filter
        if (isPaid !== undefined) {
            query.isPaid = isPaid === 'true';
        }

        // Featured filter (used by the homepage "Featured books" section)
        if (featured !== undefined) {
            query.featured = featured === 'true';
        }

        let cursor = Book.find(query)
            .select('-pdfDownloadLink') // Don't send download link to frontend
            .sort(SORT_MAP[sort] || SORT_MAP.newest);

        if (limit) {
            cursor = cursor.limit(parseInt(limit, 10));
        }

        const books = await cursor;

        res.json({
            success: true,
            count: books.length,
            data: books
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @route   GET /api/books/admin/all
// @desc    Get every book for the admin panel, including drafts and inactive items
// @access  Private (Admin)
exports.getAllBooksAdmin = async (req, res) => {
    try {
        const { search, category } = req.query;

        let query = {};

        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { author: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        if (category) {
            query.category = category;
        }

        const books = await Book.find(query)
            .select('-pdfDownloadLink')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: books.length,
            data: books
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @route   GET /api/books/:id
// @desc    Get single book (by slug or by Mongo id, so /books/:slug URLs work for SEO)
exports.getBook = async (req, res) => {
    try {
        const { id } = req.params;
        const isObjectId = mongoose.Types.ObjectId.isValid(id);

        const book = await Book.findOne(
            isObjectId ? { $or: [{ slug: id }, { _id: id }] } : { slug: id }
        ).select('-pdfDownloadLink');

        if (!book) {
            return res.status(404).json({
                success: false,
                error: 'Book not found'
            });
        }

        res.json({
            success: true,
            data: book
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @route   GET /api/books/:id/thumbnail
// @desc    Serve the book's cover as a real image response (not JSON/base64)
//          so it can be used as an og:image / social share preview and as a
//          Web Share API file, neither of which can use a data: URI.
exports.getBookThumbnail = async (req, res) => {
    try {
        const { id } = req.params;
        const isObjectId = mongoose.Types.ObjectId.isValid(id);

        const book = await Book.findOne(
            isObjectId ? { $or: [{ slug: id }, { _id: id }] } : { slug: id }
        ).select('thumbnail');

        const dataUri = book?.thumbnail?.data;
        const match = typeof dataUri === 'string' && dataUri.match(/^data:([^;]+);base64,(.+)$/);

        if (!match) {
            return res.status(404).end();
        }

        const [, contentType, base64Data] = match;
        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=86400, immutable');
        return res.send(Buffer.from(base64Data, 'base64'));
    } catch (error) {
        res.status(500).end();
    }
};

// @route   POST /api/books
// @desc    Create book (Admin only)
exports.createBook = async (req, res) => {
    try {
        const {
            title,
            author,
            description,
            thumbnailBase64,
            pdfDriveLink,
            price,
            isPaid,
            isPublished,
            category,
            featured,
            tags
        } = req.body;

        // Validate required fields
        if (!title || !description || !pdfDriveLink || !thumbnailBase64) {
            return res.status(400).json({
                success: false,
                error: 'Please provide all required fields'
            });
        }

        // Validate Drive link
        if (!isValidAssetLink(pdfDriveLink)) {
            return res.status(400).json({ success: false, error: 'Invalid asset link. Use a Google Drive share link or any direct http(s) URL.' });
        }

        // Process thumbnail
        let thumbnail;
        if (thumbnailBase64.startsWith('data:image')) {
            // Extract base64 data
            const base64Data = thumbnailBase64.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            thumbnail = await processImage(buffer);
        } else {
            // Not a data URI — treat as a raw base64 string and wrap it so
            // it's directly usable as an <img src>.
            thumbnail = {
                data: `data:image/jpeg;base64,${thumbnailBase64}`,
                contentType: 'image/jpeg'
            };
        }

        // Generate download link
        const pdfDownloadLink = getAssetDownloadLink(pdfDriveLink);

        // Create book
        const book = await Book.create({
            title,
            author,
            description,
            thumbnail,
            pdfDriveLink,
            pdfDownloadLink,
            price: isPaid ? price : 0,
            isPaid,
            isPublished,
            category,
            featured: !!featured,
            tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
            createdBy: req.user._id
        });

        res.status(201).json({
            success: true,
            data: book
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @route   PUT /api/books/:id
// @desc    Update book (Admin only)
exports.updateBook = async (req, res) => {
    try {
        let book = await Book.findById(req.params.id);

        if (!book) {
            return res.status(404).json({
                success: false,
                error: 'Book not found'
            });
        }

        // Process new thumbnail if provided
        if (req.body.thumbnailBase64) {
            const base64Data = req.body.thumbnailBase64.startsWith('data:image')
                ? req.body.thumbnailBase64.split(',')[1]
                : req.body.thumbnailBase64;

            const buffer = Buffer.from(base64Data, 'base64');
            req.body.thumbnail = await processImage(buffer);
            delete req.body.thumbnailBase64;
        }

        // Update Drive link if changed
        if (req.body.pdfDriveLink && req.body.pdfDriveLink !== book.pdfDriveLink) {
            if (!isValidAssetLink(req.body.pdfDriveLink)) {
                return res.status(400).json({ success: false, error: 'Invalid asset link. Use a Google Drive share link or any direct http(s) URL.' });
            }
            req.body.pdfDownloadLink = getAssetDownloadLink(req.body.pdfDriveLink);
        }

        // Update tags if provided
        if (req.body.tags && typeof req.body.tags === 'string') {
            req.body.tags = req.body.tags.split(',').map(tag => tag.trim());
        }

        book = await Book.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        res.json({
            success: true,
            data: book
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @route   DELETE /api/books/:id
// @desc    Delete book (Admin only)
exports.deleteBook = async (req, res) => {
    try {
        const book = await Book.findById(req.params.id);

        if (!book) {
            return res.status(404).json({
                success: false,
                error: 'Book not found'
            });
        }

        await book.deleteOne();

        res.json({
            success: true,
            message: 'Book deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// @route   GET /api/books/categories
// @desc    Get all categories
exports.getCategories = async (req, res) => {
    try {
        const categories = await Book.distinct('category');

        res.json({
            success: true,
            data: categories
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
