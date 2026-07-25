# Books PDF — Astro rebuild

Phases 1 & 2 of the migration from Next.js to Astro. The Express + MongoDB
backend (`backend/`) is untouched except for additive changes — nothing
existing was removed or renamed, so your current admin panel, auth, and
payments keep working while this new frontend is rolled out.

## What's included

**Phase 1 — Public SEO pages**
- Home, Books (list + detail), Courses (list + detail, new), About, Contact,
  FAQs, How it works, Delivery info, Privacy Policy, Terms, Refund Policy,
  custom 404 / 500
- Category / price / sort filters, plus a combined Books ↔ Courses type
  filter, all as crawlable GET-param URLs
- Dark/light toggle (no-flash, persisted) and an English/Hindi language
  toggle (Marathi, Gujarati, Tamil, Telugu, Bengali are wired in as
  "Coming soon" — see `src/i18n`)
- Full SEO plumbing: canonical URLs, OG/Twitter tags, Organization / WebSite
  / Book / Course / FAQPage JSON-LD, dynamic sitemap, robots.txt

**Phase 2 — Auth, dashboard, my library**
- Login, register, forgot-password (OTP flow) — talk directly to your
  existing `/api/auth/*` routes, same JWT-in-localStorage pattern your
  current frontend already uses, so no backend changes were needed here
- Header swaps Login/Register for a user menu automatically once a token
  exists (`AuthNav.jsx`)
- Dashboard: profile summary, purchase stats, recent purchases, editable
  account details
- My Library: full purchase history with re-download links via your
  existing `/api/payments/download/:token` route

**Backend additions (additive only)**
- New `Course` model/controller/routes mirroring `Book` exactly, mounted at
  `/api/courses`
- `slug` and `featured` fields added to `Book` (and present on `Course`) —
  existing documents are unaffected; slugs are generated on first save
- Expanded category enum to include NCERT, Foundation, Hindi Books,
  Competitive Exams, General Reading (old categories kept)
- `sort` (newest/popular/rating/price-low/price-high) and `featured` query
  params added to the books/courses list endpoints

## Getting started

```bash
cd bookspdf-astro
npm install
cp .env.example .env   # point PUBLIC_API_URL / API_URL at your backend
npm run dev             # http://localhost:4321
```

The site works even if the backend isn't running: `src/lib/api.js` falls
back to sample book/course data for browsing pages (clearly marked in
comments, safe to delete once your API is live). Auth pages do **not** have
a fallback — they need the real backend.

To run against your backend, copy the `backend/` folder changes over (or
apply the diffs in `models/Book.js`, `models/Course.js` (new),
`controllers/bookController.js`, `controllers/courseController.js` (new),
`routes/courses.js` (new), and the one-line addition in `server.js`), then
set `PUBLIC_API_URL=http://localhost:5000/api`.

## What's left (Phase 3)

- Admin panel: book management (already exists in your Next app — port it),
  plus the new **course upload** UI (reuses the same form shape as book
  upload, since Course = title/author/description/thumbnail/PDF link/price)
- Payment checkout flow (PhonePe) wired into the book/course detail "Buy"
  buttons, which currently link to `/login?next=...` as a placeholder
- Profile page split out from Dashboard, if you want it as a separate route
- Filling in the remaining language dictionaries
  (`src/i18n/dictionaries/{mr,gu,ta,te,bn}.json`) once translations are ready

## Deploying to Cloudflare

This app is configured to deploy as an SSR site on Cloudflare (Pages/Workers)
via `@astrojs/cloudflare` — see `astro.config.mjs` and `wrangler.toml` in
this folder.

```bash
npm install          # picks up @astrojs/cloudflare (lockfile was regenerated)
npm run build         # outputs to ./dist
npx wrangler deploy   # or `npx wrangler pages deploy dist` for Pages
```

Before deploying:
- Edit `wrangler.toml` and replace `your-backend-domain.com` with your real
  backend URL, and fill in `PUBLIC_GOOGLE_CLIENT_ID`. You can also set these
  as environment variables/secrets in the Cloudflare dashboard instead of
  committing them to `wrangler.toml`.
- **The `backend/` Express app is NOT deployed to Cloudflare.** It uses
  Mongoose (MongoDB), `sharp` (native binary), and `multer` disk-based file
  uploads — none of which run in the Workers runtime. Keep hosting it on a
  regular Node host (Railway, Render, Fly.io, a VPS, etc.) and point
  `PUBLIC_API_URL` / `API_URL` at that host.
- `passthroughImageService()` is already used for images (see comment in
  `astro.config.mjs`), so no image-service changes are needed for Cloudflare.

## Notes on the design

The visual identity ("admit card / hall ticket" — paper cream, deep-indigo
ink, marigold accent, perforated card edges) was chosen deliberately for the
Indian student/exam-prep audience rather than a generic template look. Tokens
live in `tailwind.config.mjs` and `src/styles/global.css` if you want to
adjust the palette.
