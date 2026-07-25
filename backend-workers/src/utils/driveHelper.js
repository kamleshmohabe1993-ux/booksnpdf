// Convert Google Drive sharing link to direct download link
export function getDriveDownloadLink(driveLink) {
  let fileId = null;

  if (driveLink.includes('/file/d/')) {
    fileId = driveLink.split('/file/d/')[1].split('/')[0];
  } else if (driveLink.includes('open?id=')) {
    fileId = driveLink.split('open?id=')[1].split('&')[0];
  } else if (!driveLink.includes('drive.google.com')) {
    fileId = driveLink;
  }

  if (!fileId) {
    throw new Error('Invalid Google Drive link');
  }

  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

export function validateDriveLink(link) {
  if (!link || typeof link !== 'string') {
    throw new Error('Invalid Drive link');
  }

  const validPatterns = [
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
  ];

  const isValid = validPatterns.some((pattern) => pattern.test(link));

  if (!isValid && !link.match(/^[a-zA-Z0-9_-]+$/)) {
    throw new Error('Invalid Google Drive link format');
  }

  return true;
}

// Validate any asset link: a Google Drive share link, or any other
// well-formed http(s) URL (Dropbox, direct CDN links, S3, etc.)
export function isValidAssetLink(link) {
  if (!link || typeof link !== 'string') return false;

  if (link.includes('drive.google.com') || link.match(/^[a-zA-Z0-9_-]+$/)) {
    try {
      validateDriveLink(link);
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
}

// Resolve any asset link to its actual download URL.
export function getAssetDownloadLink(link) {
  if (link.includes('drive.google.com') || link.match(/^[a-zA-Z0-9_-]+$/)) {
    return getDriveDownloadLink(link);
  }
  return link;
}
