// src/utils/imageHelper.js
//
// The original backend used `sharp` (a native binary) to resize/compress
// thumbnails to 400x600 JPEG before storing them as base64. Sharp cannot
// run in the Workers V8 isolate (no native modules), so there is no
// server-side resize here — the image is validated and stored as-is.
//
// Two ways to keep thumbnail sizes small without sharp:
//   1. (Recommended) Resize/compress on the client before upload — e.g. via
//      a `<canvas>` in the admin panel — so `thumbnailBase64` arrives already
//      small. This is a small addition to the admin book/course form.
//   2. Use a WASM image library that *does* run in Workers, e.g.
//      `@cf-wasm/photon` (https://github.com/pumbas600/vercel-og-tools or
//      similar Photon/WASM bindings). If you add one, swap the body of
//      `processImage` below to call it — the function signature (buffer in,
//      {data, contentType} out) is unchanged so nothing else needs to move.

export function validateImage(mimetype, size) {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const maxSize = 5 * 1024 * 1024; // 5MB

  if (!allowedTypes.includes(mimetype)) {
    throw new Error('Invalid image type. Only JPEG, PNG, and WebP allowed');
  }
  if (size > maxSize) {
    throw new Error('Image size must be less than 5MB');
  }
  return true;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000; // avoid call-stack blowups on large buffers
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// buffer: ArrayBuffer | Uint8Array
export async function processImage(buffer, contentType = 'image/jpeg') {
  try {
    validateImage(contentType, buffer.byteLength);
    const base64Image = arrayBufferToBase64(buffer);
    return {
      data: `data:${contentType};base64,${base64Image}`,
      contentType,
    };
  } catch (error) {
    throw new Error('Image processing failed: ' + error.message);
  }
}

// Decodes a `data:<mime>;base64,<data>` URI into raw bytes — used when
// serving /books/:id/thumbnail and /courses/:id/thumbnail as real image
// responses instead of JSON.
export function decodeDataUri(dataUri) {
  const match = typeof dataUri === 'string' && dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const [, contentType, base64Data] = match;
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { contentType, bytes };
}
