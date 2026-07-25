// One-off manual run of the slug backfill, with per-item console output.
// Note: this now also runs automatically every time the server starts
// (see config/database.js) — so this script is only needed if you want
// to run it on demand without restarting the server.
//
// Usage:
//   cd backend
//   node scripts/backfillSlugs.js

require('dotenv').config();
const mongoose = require('mongoose');
const Book = require('../models/Book');
const Course = require('../models/Course');

async function backfillWithLogging(Model, label) {
  const missing = await Model.find({ $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' }] });

  if (missing.length === 0) {
    console.log(`[${label}] nothing to do — every document already has a slug.`);
    return;
  }

  console.log(`[${label}] found ${missing.length} document(s) without a slug. Generating...`);

  for (const doc of missing) {
    await doc.save();
    console.log(`  - "${doc.title}" -> /${doc.slug}`);
  }

  console.log(`[${label}] done.`);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.');

  await backfillWithLogging(Book, 'Books');
  await backfillWithLogging(Course, 'Courses');

  await mongoose.disconnect();
  console.log('Done. Disconnected.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
