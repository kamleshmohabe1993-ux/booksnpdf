// src/routes/catalogFactory.js
//
// Port of controllers/bookController.js + controllers/courseController.js.
// The two were byte-for-byte identical in shape in the original app (only
// the Mongoose model differed), so this factory builds both `books` and
// `courses` routers from one implementation — see routes/books.js and
// routes/courses.js for the two thin instantiations.

import { Hono } from 'hono';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { processImage } from '../utils/imageHelper.js';
import { decodeDataUri } from '../utils/imageHelper.js';
import { getAssetDownloadLink, isValidAssetLink } from '../utils/driveHelper.js';
import { generateUniqueSlug } from '../utils/slugify.js';

const SORT_MAP = {
  newest: { createdAt: -1 },
  popular: { downloadCount: -1 },
  rating: { averageRating: -1 },
  'price-low': { price: 1 },
  'price-high': { price: -1 },
};

function isObjectId(id) {
  return ObjectId.isValid(id) && String(new ObjectId(id)) === id;
}

async function base64ToThumbnail(thumbnailBase64) {
  if (thumbnailBase64.startsWith('data:image')) {
    const [, meta, base64Data] = thumbnailBase64.match(/^data:([^;]+);base64,(.+)$/) || [];
    const contentType = meta || 'image/jpeg';
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return processImage(bytes.buffer, contentType);
  }
  return { data: `data:image/jpeg;base64,${thumbnailBase64}`, contentType: 'image/jpeg' };
}

// collectionName: 'books' | 'courses'
// notFoundLabel: 'Book' | 'Course'
export function createCatalogRouter(collectionName, notFoundLabel) {
  const router = new Hono();

  router.get('/', async (c) => {
    try {
      const { search, category, isPaid, featured, sort, limit } = c.req.query();
      const db = await getDb(c.env);

      const query = { isActive: true };
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { author: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
        ];
      }
      if (category) query.category = category;
      if (isPaid !== undefined) query.isPaid = isPaid === 'true';
      if (featured !== undefined) query.featured = featured === 'true';

      let cursor = db
        .collection(collectionName)
        .find(query, { projection: { pdfDownloadLink: 0 } })
        .sort(SORT_MAP[sort] || SORT_MAP.newest);

      if (limit) cursor = cursor.limit(parseInt(limit, 10));

      const items = await cursor.toArray();
      return c.json({ success: true, count: items.length, data: items });
    } catch (error) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  router.get('/categories', async (c) => {
    try {
      const db = await getDb(c.env);
      const categories = await db.collection(collectionName).distinct('category');
      return c.json({ success: true, data: categories });
    } catch (error) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  router.get('/admin/all', protect, adminOnly, async (c) => {
    try {
      const { search, category } = c.req.query();
      const db = await getDb(c.env);

      const query = {};
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { author: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
        ];
      }
      if (category) query.category = category;

      const items = await db
        .collection(collectionName)
        .find(query, { projection: { pdfDownloadLink: 0 } })
        .sort({ createdAt: -1 })
        .toArray();

      return c.json({ success: true, count: items.length, data: items });
    } catch (error) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  router.get('/:id/thumbnail', async (c) => {
    try {
      const id = c.req.param('id');
      const db = await getDb(c.env);
      const filter = isObjectId(id) ? { $or: [{ slug: id }, { _id: new ObjectId(id) }] } : { slug: id };
      const item = await db.collection(collectionName).findOne(filter, { projection: { thumbnail: 1 } });

      const decoded = item && decodeDataUri(item.thumbnail?.data);
      if (!decoded) return c.body(null, 404);

      c.header('Content-Type', decoded.contentType);
      c.header('Cache-Control', 'public, max-age=86400, immutable');
      return c.body(decoded.bytes);
    } catch (error) {
      return c.body(null, 500);
    }
  });

  router.get('/:id', async (c) => {
    try {
      const id = c.req.param('id');
      const db = await getDb(c.env);
      const filter = isObjectId(id) ? { $or: [{ slug: id }, { _id: new ObjectId(id) }] } : { slug: id };
      const item = await db.collection(collectionName).findOne(filter, { projection: { pdfDownloadLink: 0 } });

      if (!item) return c.json({ success: false, error: `${notFoundLabel} not found` }, 404);
      return c.json({ success: true, data: item });
    } catch (error) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  router.post('/', protect, adminOnly, async (c) => {
    try {
      const body = await c.req.json();
      const { title, author, description, thumbnailBase64, pdfDriveLink, price, isPaid, isPublished, category, featured, tags } = body;

      if (!title || !description || !pdfDriveLink || !thumbnailBase64) {
        return c.json({ success: false, error: 'Please provide all required fields' }, 400);
      }
      if (!isValidAssetLink(pdfDriveLink)) {
        return c.json({ success: false, error: 'Invalid asset link. Use a Google Drive share link or any direct http(s) URL.' }, 400);
      }

      const thumbnail = await base64ToThumbnail(thumbnailBase64);
      const pdfDownloadLink = getAssetDownloadLink(pdfDriveLink);
      const db = await getDb(c.env);
      const collection = db.collection(collectionName);
      const slug = await generateUniqueSlug(collection, title);
      const now = new Date();
      const user = c.get('user');

      const doc = {
        title,
        slug,
        featured: !!featured,
        author,
        description,
        thumbnail,
        pdfDriveLink,
        pdfDownloadLink,
        price: isPaid ? price : 0,
        isPaid: !!isPaid,
        isPublished: isPublished !== false,
        category: category || 'Other',
        downloadCount: 0,
        tags: tags ? tags.split(',').map((t) => t.trim()) : [],
        isActive: true,
        averageRating: 0,
        totalRatings: 0,
        createdBy: user._id,
        createdAt: now,
        updatedAt: now,
      };

      const { insertedId } = await collection.insertOne(doc);
      return c.json({ success: true, data: { _id: insertedId, ...doc } }, 201);
    } catch (error) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  router.put('/:id', protect, adminOnly, async (c) => {
    try {
      const db = await getDb(c.env);
      const collection = db.collection(collectionName);
      const id = new ObjectId(c.req.param('id'));
      const existing = await collection.findOne({ _id: id });
      if (!existing) return c.json({ success: false, error: `${notFoundLabel} not found` }, 404);

      const body = await c.req.json();

      if (body.thumbnailBase64) {
        body.thumbnail = await base64ToThumbnail(body.thumbnailBase64);
        delete body.thumbnailBase64;
      }

      if (body.pdfDriveLink && body.pdfDriveLink !== existing.pdfDriveLink) {
        if (!isValidAssetLink(body.pdfDriveLink)) {
          return c.json({ success: false, error: 'Invalid asset link. Use a Google Drive share link or any direct http(s) URL.' }, 400);
        }
        body.pdfDownloadLink = getAssetDownloadLink(body.pdfDriveLink);
      }

      if (body.tags && typeof body.tags === 'string') {
        body.tags = body.tags.split(',').map((t) => t.trim());
      }

      delete body._id; // never allow overwriting the id
      body.updatedAt = new Date();

      await collection.updateOne({ _id: id }, { $set: body });
      const updated = await collection.findOne({ _id: id });

      return c.json({ success: true, data: updated });
    } catch (error) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  router.delete('/:id', protect, adminOnly, async (c) => {
    try {
      const db = await getDb(c.env);
      const collection = db.collection(collectionName);
      const id = new ObjectId(c.req.param('id'));
      const existing = await collection.findOne({ _id: id });
      if (!existing) return c.json({ success: false, error: `${notFoundLabel} not found` }, 404);

      await collection.deleteOne({ _id: id });
      return c.json({ success: true, message: `${notFoundLabel} deleted successfully` });
    } catch (error) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  return router;
}
