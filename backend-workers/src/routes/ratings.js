// src/routes/ratings.js — port of routes/ratings.js + controllers/ratingController.js
import { Hono } from 'hono';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { protect } from '../middleware/auth.js';

const ratings = new Hono();

async function recalcBookRating(db, bookId) {
  const list = await db.collection('ratings').find({ book: bookId }).toArray();
  const totalRatings = list.length;
  const averageRating = totalRatings === 0 ? 0 : list.reduce((sum, r) => sum + r.rating, 0) / totalRatings;
  await db.collection('books').updateOne({ _id: bookId }, { $set: { averageRating, totalRatings } });
}

ratings.post('/', protect, async (c) => {
  try {
    const user = c.get('user');
    const { bookId, rating, review } = await c.req.json();

    if (!rating || rating < 1 || rating > 5) {
      return c.json({ success: false, error: 'Rating must be between 1 and 5' }, 400);
    }

    const db = await getDb(c.env);
    const bookObjId = new ObjectId(bookId);
    const book = await db.collection('books').findOne({ _id: bookObjId });
    if (!book) return c.json({ success: false, error: 'Book not found' }, 404);

    const existing = await db.collection('ratings').findOne({ user: user._id, book: bookObjId });

    if (existing) {
      await db
        .collection('ratings')
        .updateOne({ _id: existing._id }, { $set: { rating, review: review || existing.review, updatedAt: new Date() } });
      await recalcBookRating(db, bookObjId);
      const updated = await db.collection('ratings').findOne({ _id: existing._id });
      return c.json({ success: true, message: 'Rating updated successfully', data: updated });
    }

    const now = new Date();
    const { insertedId } = await db.collection('ratings').insertOne({
      user: user._id,
      book: bookObjId,
      rating,
      review,
      createdAt: now,
      updatedAt: now,
    });
    await recalcBookRating(db, bookObjId);

    return c.json({ success: true, message: 'Rating added successfully', data: { _id: insertedId, user: user._id, book: bookObjId, rating, review } }, 201);
  } catch (error) {
    console.error('Add rating error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

ratings.get('/:bookId', async (c) => {
  try {
    const bookId = new ObjectId(c.req.param('bookId'));
    const { page = 1, limit = 10 } = c.req.query();
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;

    const db = await getDb(c.env);
    const list = await db
      .collection('ratings')
      .aggregate([
        { $match: { book: bookId } },
        { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        { $project: { rating: 1, review: 1, createdAt: 1, updatedAt: 1, book: 1, 'user._id': 1, 'user.fullName': 1 } },
        { $sort: { createdAt: -1 } },
        { $skip: (pageNum - 1) * limitNum },
        { $limit: limitNum },
      ])
      .toArray();

    const total = await db.collection('ratings').countDocuments({ book: bookId });

    const distribution = await db
      .collection('ratings')
      .aggregate([{ $match: { book: bookId } }, { $group: { _id: '$rating', count: { $sum: 1 } } }, { $sort: { _id: -1 } }])
      .toArray();

    return c.json({
      success: true,
      data: { ratings: list, pagination: { total, page: pageNum, pages: Math.ceil(total / limitNum) }, distribution },
    });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

ratings.get('/user/:bookId', protect, async (c) => {
  try {
    const user = c.get('user');
    const bookId = new ObjectId(c.req.param('bookId'));
    const db = await getDb(c.env);
    const rating = await db.collection('ratings').findOne({ user: user._id, book: bookId });
    return c.json({ success: true, data: rating });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

ratings.delete('/:ratingId', protect, async (c) => {
  try {
    const user = c.get('user');
    const db = await getDb(c.env);
    const ratingId = new ObjectId(c.req.param('ratingId'));
    const rating = await db.collection('ratings').findOne({ _id: ratingId });
    if (!rating) return c.json({ success: false, error: 'Rating not found' }, 404);

    if (rating.user.toString() !== user._id.toString() && !user.isAdmin) {
      return c.json({ success: false, error: 'Unauthorized' }, 403);
    }

    await db.collection('ratings').deleteOne({ _id: ratingId });
    await recalcBookRating(db, rating.book);

    return c.json({ success: true, message: 'Rating deleted successfully' });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default ratings;
