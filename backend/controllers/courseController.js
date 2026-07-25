const mongoose = require('mongoose');
const Course = require('../models/Course');
const { processImage } = require('../utils/imageHelper');
const { getAssetDownloadLink, isValidAssetLink } = require('../utils/driveHelper');

const SORT_MAP = {
    newest: { createdAt: -1 },
    popular: { downloadCount: -1 },
    rating: { averageRating: -1 },
    'price-low': { price: 1 },
    'price-high': { price: -1 }
};

// @route   GET /api/courses
exports.getAllCourses = async (req, res) => {
    try {
        const { search, category, isPaid, featured, sort, limit } = req.query;

        let query = { isActive: true };

        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { author: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }
        if (category) query.category = category;
        if (isPaid !== undefined) query.isPaid = isPaid === 'true';
        if (featured !== undefined) query.featured = featured === 'true';

        let cursor = Course.find(query)
            .select('-pdfDownloadLink')
            .sort(SORT_MAP[sort] || SORT_MAP.newest);

        if (limit) cursor = cursor.limit(parseInt(limit, 10));

        const courses = await cursor;

        res.json({ success: true, count: courses.length, data: courses });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @route   GET /api/courses/admin/all
// @desc    Get every course for the admin panel, including drafts and inactive items
// @access  Private (Admin)
exports.getAllCoursesAdmin = async (req, res) => {
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

        const courses = await Course.find(query)
            .select('-pdfDownloadLink')
            .sort({ createdAt: -1 });

        res.json({ success: true, count: courses.length, data: courses });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @route   GET /api/courses/:id
exports.getCourse = async (req, res) => {
    try {
        const { id } = req.params;
        const isObjectId = mongoose.Types.ObjectId.isValid(id);

        const course = await Course.findOne(
            isObjectId ? { $or: [{ slug: id }, { _id: id }] } : { slug: id }
        ).select('-pdfDownloadLink');

        if (!course) {
            return res.status(404).json({ success: false, error: 'Course not found' });
        }

        res.json({ success: true, data: course });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @route   GET /api/courses/:id/thumbnail
// @desc    Serve the course's cover as a real image response (not JSON/base64)
//          so it can be used as an og:image / social share preview and as a
//          Web Share API file, neither of which can use a data: URI.
exports.getCourseThumbnail = async (req, res) => {
    try {
        const { id } = req.params;
        const isObjectId = mongoose.Types.ObjectId.isValid(id);

        const course = await Course.findOne(
            isObjectId ? { $or: [{ slug: id }, { _id: id }] } : { slug: id }
        ).select('thumbnail');

        const dataUri = course?.thumbnail?.data;
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

// @route   POST /api/courses (Admin only)
exports.createCourse = async (req, res) => {
    try {
        const {
            title, author, description, thumbnailBase64, pdfDriveLink,
            price, isPaid, isPublished, category, featured, tags
        } = req.body;

        if (!title || !description || !pdfDriveLink || !thumbnailBase64) {
            return res.status(400).json({ success: false, error: 'Please provide all required fields' });
        }

        if (!isValidAssetLink(pdfDriveLink)) {
            return res.status(400).json({ success: false, error: 'Invalid asset link. Use a Google Drive share link or any direct http(s) URL.' });
        }

        let thumbnail;
        if (thumbnailBase64.startsWith('data:image')) {
            const base64Data = thumbnailBase64.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            thumbnail = await processImage(buffer);
        } else {
            thumbnail = { data: `data:image/jpeg;base64,${thumbnailBase64}`, contentType: 'image/jpeg' };
        }

        const pdfDownloadLink = getAssetDownloadLink(pdfDriveLink);

        const course = await Course.create({
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

        res.status(201).json({ success: true, data: course });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @route   PUT /api/courses/:id (Admin only)
exports.updateCourse = async (req, res) => {
    try {
        let course = await Course.findById(req.params.id);
        if (!course) {
            return res.status(404).json({ success: false, error: 'Course not found' });
        }

        if (req.body.thumbnailBase64) {
            const base64Data = req.body.thumbnailBase64.startsWith('data:image')
                ? req.body.thumbnailBase64.split(',')[1]
                : req.body.thumbnailBase64;
            const buffer = Buffer.from(base64Data, 'base64');
            req.body.thumbnail = await processImage(buffer);
            delete req.body.thumbnailBase64;
        }

        if (req.body.pdfDriveLink && req.body.pdfDriveLink !== course.pdfDriveLink) {
            if (!isValidAssetLink(req.body.pdfDriveLink)) {
                return res.status(400).json({ success: false, error: 'Invalid asset link. Use a Google Drive share link or any direct http(s) URL.' });
            }
            req.body.pdfDownloadLink = getAssetDownloadLink(req.body.pdfDriveLink);
        }

        if (req.body.tags && typeof req.body.tags === 'string') {
            req.body.tags = req.body.tags.split(',').map(tag => tag.trim());
        }

        course = await Course.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });

        res.json({ success: true, data: course });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @route   DELETE /api/courses/:id (Admin only)
exports.deleteCourse = async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if (!course) {
            return res.status(404).json({ success: false, error: 'Course not found' });
        }
        await course.deleteOne();
        res.json({ success: true, message: 'Course deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @route   GET /api/courses/categories
exports.getCategories = async (req, res) => {
    try {
        const categories = await Course.distinct('category');
        res.json({ success: true, data: categories });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
