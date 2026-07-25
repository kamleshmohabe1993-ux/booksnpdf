const mongoose = require('mongoose');
const { slugify } = require('../utils/slugify');

const courseSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    // SEO-friendly URL slug, e.g. /courses/jee-foundation-builder
    slug: {
        type: String,
        unique: true,
        sparse: true
    },
    // Surfaces the course in the homepage "Courses" section
    featured: {
        type: Boolean,
        default: false
    },
    author: {
        // Instructor / faculty name
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
        enum: ['NCERT', 'Foundation', 'Hindi Books', 'Competitive Exams', 'General Reading', 'Other'],
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

courseSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

courseSchema.pre('save', async function(next) {
    if (this.slug || !this.title) return next();

    const base = slugify(this.title);
    let candidate = base;
    let suffix = 1;
    const Course = this.constructor;
    while (await Course.exists({ slug: candidate })) {
        suffix += 1;
        candidate = `${base}-${suffix}`;
    }
    this.slug = candidate;
    next();
});

module.exports = mongoose.model('Course', courseSchema);
