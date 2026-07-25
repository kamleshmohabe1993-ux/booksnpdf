export function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Generates a unique slug for `title` within `collection`, appending
// -2, -3, ... on collision. Replicates the Mongoose pre-save hook logic
// from the original models/Book.js and models/Course.js, since native
// MongoDB driver documents have no hooks.
export async function generateUniqueSlug(collection, title) {
  const base = slugify(title);
  let candidate = base;
  let suffix = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await collection.findOne({ slug: candidate }, { projection: { _id: 1 } })) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}
