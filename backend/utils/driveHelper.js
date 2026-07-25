// Convert Google Drive sharing link to direct download link
exports.getDriveDownloadLink = (driveLink) => {
    try {
        // Extract file ID from various Drive link formats
        let fileId = null;

        // Format 1: https://drive.google.com/file/d/FILE_ID/view?usp=sharing
        if (driveLink.includes('/file/d/')) {
            fileId = driveLink.split('/file/d/')[1].split('/')[0];
        }
        // Format 2: https://drive.google.com/open?id=FILE_ID
        else if (driveLink.includes('open?id=')) {
            fileId = driveLink.split('open?id=')[1].split('&')[0];
        }
        // Format 3: Already a file ID
        else if (!driveLink.includes('drive.google.com')) {
            fileId = driveLink;
        }

        if (!fileId) {
            throw new Error('Invalid Google Drive link');
        }

        // Return direct download link
        return `https://drive.google.com/uc?export=download&id=${fileId}`;
    } catch (error) {
        throw new Error('Failed to process Drive link: ' + error.message);
    }
};

// Validate any asset link: a Google Drive share link, or any other
// well-formed http(s) URL (Dropbox, direct CDN links, S3, etc.)
exports.isValidAssetLink = (link) => {
    if (!link || typeof link !== 'string') return false;

    if (link.includes('drive.google.com') || link.match(/^[a-zA-Z0-9_-]+$/)) {
        try {
            exports.validateDriveLink(link);
            return true;
        } catch {
            return false;
        }
    }

    try {
        const url = new URL(link);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
};

// Resolve any asset link to its actual download URL: Google Drive links get
// converted to a direct-download link, anything else is used as-is (it's
// assumed to already be a direct, shareable link).
exports.getAssetDownloadLink = (link) => {
    if (link.includes('drive.google.com') || link.match(/^[a-zA-Z0-9_-]+$/)) {
        return exports.getDriveDownloadLink(link);
    }
    return link;
};

// Validate Drive link
exports.validateDriveLink = (link) => {
    if (!link || typeof link !== 'string') {
        throw new Error('Invalid Drive link');
    }

    const validPatterns = [
        /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
        /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/
    ];

    const isValid = validPatterns.some(pattern => pattern.test(link));

    if (!isValid && !link.match(/^[a-zA-Z0-9_-]+$/)) {
        throw new Error('Invalid Google Drive link format');
    }

    return true;
};