const API_URL = import.meta.env.API_URL || import.meta.env.PUBLIC_API_URL || 'http://localhost:5000/api';

// A stable, absolute URL that serves the raw thumbnail image bytes (not the
// base64 data URI the JSON API returns). Needed anywhere a real fetchable
// image URL is required — social link-preview crawlers (og:image) and the
// Web Share API's file-sharing path can't use a data: URI.
export function getThumbnailUrl(item, kind = 'book') {
  if (!item?.thumbnail?.data) return null;
  const segment = kind === 'course' ? 'courses' : 'books';
  return `${API_URL}/${segment}/${item.slug || item._id}/thumbnail`;
}

async function safeFetch(path) {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store', // Astro SSR: always show a fresh catalogue, never a stale build
    });
    if (!res.ok) throw new Error(`API ${path} responded ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`[api] falling back to sample data for ${path}:`, err.message);
    return null;
  }
}

function buildQuery(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && v !== 'all') qs.set(k, v);
  });
  const s = qs.toString();
  return s ? `?${s}` : '';
}

// Some existing records were saved with `thumbnail.data` as a bare base64
// string (missing the "data:image/...;base64," prefix a browser needs to
// render it inline) due to a since-fixed backend bug. Reconstruct a proper
// data URI here so both old and new records render correctly, with no DB
// migration required.
function normalizeThumbnail(thumbnail) {
  if (!thumbnail?.data) return undefined;
  if (thumbnail.data.startsWith('data:')) return thumbnail;
  return {
    ...thumbnail,
    data: `data:${thumbnail.contentType || 'image/jpeg'};base64,${thumbnail.data}`,
  };
}

// Maps the raw Mongoose document shape (Book.js / Course.js) to the flat
// shape the Astro components (BookCard, detail pages) expect.
function normalize(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    slug: doc.slug || doc._id,
    title: doc.title,
    author: doc.author,
    category: doc.category,
    price: doc.price || 0,
    rating: doc.averageRating ?? 0,
    ratingCount: doc.totalRatings ?? 0,
    downloads: doc.downloadCount ?? 0,
    description: doc.description,
    createdAt: doc.createdAt,
    featured: !!doc.featured,
    thumbnail: normalizeThumbnail(doc.thumbnail),
  };
}

// Translate our UI filter vocabulary (price=free|paid, sort=…) into the
// query params the Express API actually understands (isPaid=true|false, sort=…).
function toApiParams({ category, price, sort, search, featured, limit } = {}) {
  const params = { category, search, sort, limit };
  if (featured !== undefined) params.featured = featured;
  if (price === 'free') params.isPaid = 'false';
  if (price === 'paid') params.isPaid = 'true';
  return params;
}

// ---------------------------------------------------------------------------
// DEMO FALLBACK DATA
// Only used when the Express API at API_URL is unreachable, so the storefront
// is still browsable while the backend isn't running. Safe to delete once
// /api/books & /api/courses are live — safeFetch() will simply stop needing it.
// ---------------------------------------------------------------------------
const SAMPLE_BOOKS = [
  { _id: 'sample-b1', slug: 'ncert-class-10-science', title: 'NCERT Class 10 Science', author: 'NCERT', category: 'NCERT', price: 0, rating: 4.7, ratingCount: 812, downloads: 15234, description: 'The complete NCERT Class 10 Science textbook, in a clean searchable PDF.', featured: true, createdAt: '2026-06-01' },
  { _id: 'sample-b2', slug: 'foundation-mathematics-jee', title: 'Foundation Mathematics for JEE', author: 'Books PDF Editorial', category: 'Foundation', price: 149, rating: 4.5, ratingCount: 341, downloads: 6021, description: 'A foundation-level mathematics guide built for early JEE preparation.', featured: true, createdAt: '2026-05-18' },
  { _id: 'sample-b3', slug: 'hindi-vyakaran-poorna-guide', title: 'हिंदी व्याकरण — पूर्ण गाइड', author: 'Dr. Ramesh Chandra', category: 'Hindi Books', price: 0, rating: 4.6, ratingCount: 502, downloads: 9871, description: 'Complete Hindi grammar reference, free to download.', featured: true, createdAt: '2026-04-22' },
  { _id: 'sample-b4', slug: 'upsc-prelims-foundation', title: 'UPSC Prelims Foundation Course Book', author: 'Books PDF Editorial', category: 'Competitive Exams', price: 299, rating: 4.8, ratingCount: 210, downloads: 3120, description: 'A structured foundation text for UPSC Prelims aspirants.', featured: false, createdAt: '2026-03-10' },
];

const SAMPLE_COURSES = [
  { _id: 'sample-c1', slug: 'ncert-class-10-science-crash-course', title: 'NCERT Class 10 Science — Crash Course', author: 'Books PDF Faculty', category: 'NCERT', price: 0, rating: 4.6, ratingCount: 120, downloads: 4210, description: 'A chapter-by-chapter PDF course covering the full Class 10 Science syllabus.', featured: true, createdAt: '2026-06-10' },
  { _id: 'sample-c2', slug: 'jee-foundation-builder', title: 'JEE Foundation Builder', author: 'Books PDF Faculty', category: 'Foundation', price: 499, rating: 4.7, ratingCount: 88, downloads: 1876, description: 'A guided, module-based course to build core concepts before full JEE prep.', featured: true, createdAt: '2026-05-30' },
];

const CATEGORIES = ['NCERT', 'Foundation', 'Hindi Books', 'Competitive Exams', 'General Reading'];

function applyDemoFilters(items, { category, price, search, sort, featured } = {}) {
  let out = [...items];
  if (category) out = out.filter((i) => i.category === category);
  if (price === 'free') out = out.filter((i) => Number(i.price) === 0);
  if (price === 'paid') out = out.filter((i) => Number(i.price) > 0);
  if (featured !== undefined) out = out.filter((i) => i.featured === (featured === true || featured === 'true'));
  if (search) {
    const q = search.toLowerCase();
    out = out.filter((i) => i.title.toLowerCase().includes(q) || i.author?.toLowerCase().includes(q));
  }
  switch (sort) {
    case 'popular': out.sort((a, b) => (b.downloads || 0) - (a.downloads || 0)); break;
    case 'rating': out.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
    case 'price-low': out.sort((a, b) => (a.price || 0) - (b.price || 0)); break;
    case 'price-high': out.sort((a, b) => (b.price || 0) - (a.price || 0)); break;
    default: out.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  return out;
}

export async function getBooks(params = {}) {
  const res = await safeFetch(`/books${buildQuery(toApiParams(params))}`);
  if (res?.success) {
    const books = res.data.map(normalize);
    return { books, total: res.count, demo: false };
  }
  const books = applyDemoFilters(SAMPLE_BOOKS, params);
  return { books, total: books.length, demo: true };
}

export async function getFeaturedBooks(limit = 8) {
  const res = await safeFetch(`/books${buildQuery({ featured: 'true', limit })}`);
  if (res?.success) return res.data.map(normalize);
  return applyDemoFilters(SAMPLE_BOOKS, { featured: true }).slice(0, limit);
}

export async function getBookBySlug(slug) {
  const res = await safeFetch(`/books/${slug}`);
  if (res?.success) return normalize(res.data);
  return SAMPLE_BOOKS.find((b) => b.slug === slug || b._id === slug) || null;
}

export async function getCourses(params = {}) {
  const res = await safeFetch(`/courses${buildQuery(toApiParams(params))}`);
  if (res?.success) {
    const courses = res.data.map(normalize);
    return { courses, total: res.count, demo: false };
  }
  const courses = applyDemoFilters(SAMPLE_COURSES, params);
  return { courses, total: courses.length, demo: true };
}

export async function getFeaturedCourses(limit = 8) {
  const res = await safeFetch(`/courses${buildQuery({ featured: 'true', limit })}`);
  if (res?.success) return res.data.map(normalize);
  return applyDemoFilters(SAMPLE_COURSES, { featured: true }).slice(0, limit);
}

export async function getCourseBySlug(slug) {
  const res = await safeFetch(`/courses/${slug}`);
  if (res?.success) return normalize(res.data);
  return SAMPLE_COURSES.find((c) => c.slug === slug || c._id === slug) || null;
}

export async function getCategories() {
  const res = await safeFetch('/books/categories');
  if (res?.success && res.data.length) return res.data;
  return CATEGORIES;
}
