const mongoose = require('mongoose');
const { slugify } = require('../utils/slugify');

const bookSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    // SEO-friendly URL slug, e.g. /books/ncert-class-10-science
    slug: {
        type: String,
        unique: true,
        sparse: true
    },
    // Surfaces the book in the homepage "Featured books" section
    featured: {
        type: Boolean,
        default: false
    },
    author: {
        type: String,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    thumbnail: {
        data: String,
        contentType: String
    },
    pdfDriveLink: {
        type: String,
        required: true
    },
    pdfDownloadLink: {
        type: String
    },
    price: {
        type: Number,
        default: 0,
        min: 0
    },
    isPaid: {
        type: Boolean,
        default: false
    },
    isPublished: {
        type: Boolean,
        default: true
    },
    category: {
        type: String,
        enum: [
            'NCERT', 'Foundation', 'Hindi Books', 'Competitive Exams', 'General Reading',
            'Education', 'Business', 'Design', 'Marketing', 'Religious', 'Spiritual', 'Relationship', 'Motivational', 'Other',
        ],
        default: 'Other'
    },
    downloadCount: {
        type: Number,
        default: 0
    },
    tags: [String],
    isActive: {
        type: Boolean,
        default: true
    },
    // Rating fields
    averageRating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    totalRatings: {
        type: Number,
        default: 0
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update timestamp
bookSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Generate a URL-safe slug from the title the first time a book is saved
bookSchema.pre('save', async function(next) {
    if (this.slug || !this.title) return next();

    const base = slugify(this.title);
    let candidate = base;
    let suffix = 1;
    const Book = this.constructor;
    while (await Book.exists({ slug: candidate })) {
        suffix += 1;
        candidate = `${base}-${suffix}`;
    }
    this.slug = candidate;
    next();
});

module.exports = mongoose.model('Book', bookSchema);