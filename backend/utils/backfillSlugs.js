// Reusable slug backfill logic — fills in `slug` for any Book/Course
// document that doesn't have one yet (e.g. created before the slug field
// existed). Safe to call repeatedly: it only touches documents where slug
// is missing/null/empty, and reuses the model's own pre-save hook to
// generate a unique slug from the title.
//
// Used by:
//   - config/database.js (runs automatically on every server start)
//   - scripts/backfillSlugs.js (manual one-off run, with console output)

async function backfillSlugsFor(Model) {
  const missing = await Model.find({ $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' } ] });

  for (const doc of missing) {
    // .save() re-runs the model's pre-save hook, which only fills in a slug
    // when one isn't already set.
    await doc.save();
  }

  return missing.length;
}

async function backfillSlugs({ verbose = false } = {}) {
  const Book = require('../models/Book');
  const Course = require('../models/Course');

  const bookCount = await backfillSlugsFor(Book);
  const courseCount = await backfillSlugsFor(Course);

  if (verbose && (bookCount || courseCount)) {
    console.log(`🔗 Slug backfill: generated ${bookCount} book slug(s), ${courseCount} course slug(s)`);
  }

  return { bookCount, courseCount };
}

module.exports = { backfillSlugs };
