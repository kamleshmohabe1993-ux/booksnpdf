const sharp = require('sharp');

// Convert image to Base64 and compress
exports.processImage = async (buffer) => {
    try {
        // Resize and compress image
        const processedImage = await sharp(buffer)
            .resize(400, 600, {
                fit: 'cover',
                position: 'center'
            })
            .jpeg({ quality: 80 })
            .toBuffer();

        // Convert to Base64 — store as a complete data URI so it's directly
        // usable as an <img src>. (Previously this stored the raw base64
        // string with no "data:image/...;base64," prefix, which meant
        // <img src={thumbnail.data}> silently failed to render anywhere it
        // was used.)
        const base64Image = processedImage.toString('base64');

        return {
            data: `data:image/jpeg;base64,${base64Image}`,
            contentType: 'image/jpeg'
        };
    } catch (error) {
        throw new Error('Image processing failed: ' + error.message);
    }
};

// Validate image
exports.validateImage = (mimetype, size) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!allowedTypes.includes(mimetype)) {
        throw new Error('Invalid image type. Only JPEG, PNG, and WebP allowed');
    }

    if (size > maxSize) {
        throw new Error('Image size must be less than 5MB');
    }

    return true;
};