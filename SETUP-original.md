# Setup & Execution Guide — Books PDF

This covers getting `backend/` (Express + MongoDB, unchanged apart from the
additive Course support) and `frontend-astro/` (the new Astro site) running
locally, and a few notes for deploying.

---

## 1. Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | 18.17+ (20+ recommended) | `node -v` |
| npm | 9+ | `npm -v` |
| MongoDB | local install or a free Atlas cluster | `mongod --version` or an Atlas connection string |

You'll also want, before going live:
- A **PhonePe** merchant/business account (for payments)
- A **Resend** account (for OTP/transactional email)

Both can be stubbed out for local dev — see step 3.

---

## 2. Get the code

```bash
unzip bookspdf-complete.zip
cd bookspdf-complete
```

You should see:
```
backend/            ← Express API + MongoDB
frontend-astro/      ← Astro site (talks to backend/ over HTTP)
```

---

## 3. Backend setup

```bash
cd backend
npm install
```

> **Note:** `backend/.npmrc` (included) sets `allow-remote=all` so `npm install`
> succeeds — newer npm versions block tarball-URL dependencies by default for
> security, and the PhonePe SDK (`pg-sdk-node`) is installed that way. If you
> ever see an `EALLOWREMOTE` error, it means this `.npmrc` got removed or
> overridden; just re-add it or run `npm install --allow-remote=all`.

Create `backend/.env` (this file is not included in the zip — never commit
real secrets) with:

```bash
# --- Server ---
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:4321        # the Astro dev server's origin, for CORS

# --- Database ---
MONGODB_URI=mongodb://127.0.0.1:27017/bookspdf
# or, for Atlas:
# MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/bookspdf

# --- Auth ---
JWT_SECRET=replace-with-a-long-random-string
JWT_EXPIRE=7d

# --- Google Sign-In (SSO) ---
# Create an OAuth 2.0 Client ID (type "Web application") at
# https://console.cloud.google.com/apis/credentials, and add your frontend
# origin(s) (e.g. http://localhost:4321, https://bookspdf.com) under
# "Authorized JavaScript origins". No redirect URI is needed — the login
# page uses Google's One Tap/button flow and posts the ID token directly.
GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com

# --- Seed admin account (created automatically on first boot) ---
ADMIN_EMAIL=admin@bookspdf.com
ADMIN_PASSWORD=choose-a-strong-password

# --- Email (OTP / transactional) ---
RESEND_API_KEY=re_xxx...
EMAIL_HOST=smtp.resend.com
EMAIL_USER=resend
EMAIL_PASSWORD=re_xxx...

# --- PhonePe payments ---
PHONEPE_CLIENT_ID=your-client-id
PHONEPE_CLIENT_SECRET=your-client-secret
PHONEPE_CLIENT_VERSION=1
PHONEPE_MERCHANT_ID=your-merchant-id
PHONEPE_SALT_KEY=your-salt-key
PHONEPE_SALT_INDEX=1
PHONEPE_WEBHOOK_USERNAME=choose-a-username
PHONEPE_WEBHOOK_PASSWORD=choose-a-password
```

**Local dev without real PhonePe/Resend keys:** the server will still boot
and every non-payment, non-email feature (browsing, auth, dashboard,
library) works fine — you'll just see a startup warning
(`⚠️ PhonePe configuration incomplete`) and OTP emails will fail to send
until real keys are added. Put in placeholder values so `dotenv` has
something to read.

Start MongoDB if it's not already running:
```bash
# Debian/Ubuntu, if installed locally
sudo systemctl start mongod
# or just run it directly
mongod --dbpath ./data
```

Run the backend:
```bash
npm run dev      # nodemon, auto-restarts on changes — recommended for dev
# or
npm start        # plain node, for production
```

You should see:
```
MongoDB Connected: ...
✅ PhonePe V2 SDK initialized   (or a warning if keys are placeholders)
🚀 Server running on port 5000
```

Verify it's alive:
```bash
curl http://localhost:5000/api/health
# {"success":true,"message":"Server is running",...}
```

The admin account from `ADMIN_EMAIL` / `ADMIN_PASSWORD` is created
automatically the first time the server connects to a fresh database.

---

## 4. Frontend setup (Astro)

Open a **second terminal** (keep the backend running in the first):

```bash
cd frontend-astro
npm install
cp .env.example .env
```

Edit `frontend-astro/.env`:
```bash
PUBLIC_API_URL=http://localhost:5000/api
API_URL=http://localhost:5000/api
SITE_URL=http://localhost:4321

# Same OAuth Client ID as the backend's GOOGLE_CLIENT_ID — this one is
# public (safe to expose to the browser) and renders the "Sign in with
# Google" button on the login page. Leave unset to hide the button.
PUBLIC_GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
```

Run it:
```bash
npm run dev
```

Open **http://localhost:4321**. You should see the homepage. If the
backend has no books/courses yet, the catalogue pages will show sample
placeholder data (clearly marked in `src/lib/api.js`) rather than an empty
page — that's expected until you add real content via the admin panel.

---

## 5. Add your first book/course (until the admin UI is ready)

The admin panel UI for books already exists in your original Next.js app
(`books-pdf/app/admin`) and can be used as-is against this same backend —
run it alongside, or POST directly:

```bash
# 1. Log in as admin to get a token
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@bookspdf.com","password":"choose-a-strong-password"}'
# copy the "token" from the response

# 2. Create a book
curl -X POST http://localhost:5000/api/books \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "title": "NCERT Class 10 Science",
    "author": "NCERT",
    "description": "Full NCERT Class 10 Science textbook.",
    "thumbnailBase64": "data:image/png;base64,iVBORw0KGgo...",
    "pdfDriveLink": "https://drive.google.com/file/d/XXXXX/view",
    "price": 0,
    "isPaid": false,
    "isPublished": true,
    "category": "NCERT",
    "featured": true
  }'

# 3. Create a course — identical shape, different endpoint
curl -X POST http://localhost:5000/api/courses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{ "title": "...", "description": "...", "thumbnailBase64": "...", "pdfDriveLink": "...", "category": "Foundation", "featured": true }'
```

Refresh the Astro homepage — your real book/course now replaces the sample
data.

> **On the missing books/content:** the sample data you see on a fresh
> install (Books/Courses pages, homepage) is placeholder-only — it exists so
> the site is browsable before you've added anything. Your actual book
> catalogue lives in your production MongoDB, which isn't included in this
> zip (it never was, in any handoff) — this site will show your real books
> the moment it's pointed at that database. The **legal/info pages**
> (About, Contact, FAQs, How It Works, Delivery Info, Privacy Policy, Terms,
> Refund Policy), however, now contain the actual copy pulled from your
> uploaded Next.js codebase — not placeholder text.

---

## 6. Running both together day to day

```bash
# terminal 1
cd backend && npm run dev

# terminal 2
cd frontend-astro && npm run dev
```

- Backend: http://localhost:5000
- Frontend: http://localhost:4321 ← open this one in your browser

---

## 7. Building for production

**Backend** — no build step, just run it under a process manager:
```bash
cd backend
npm install --production
NODE_ENV=production node server.js
# or with pm2:
pm2 start server.js --name bookspdf-api
```

**Frontend** — Astro builds to a standalone Node server (SSR):
```bash
cd frontend-astro
npm install
npm run build          # outputs to dist/
node dist/server/entry.mjs   # starts the SSR server, default port 4321
```
Set `PORT=4321` (or your preferred port) as an env var before that last
command if you need a different port. Put both processes behind nginx/Caddy
with the frontend as the public site and `/api` proxied (or CORS-allowed)
to the backend.

Remember to set production env vars on both sides:
- `backend/.env`: `NODE_ENV=production`, real PhonePe + Resend keys,
  `FRONTEND_URL` set to your real domain
- `frontend-astro/.env`: `PUBLIC_API_URL` / `API_URL` pointing at your
  deployed backend URL, `SITE_URL` set to your real domain (used for
  canonical URLs and the sitemap)

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `MongoDB Connected` never prints, process exits | `MONGODB_URI` wrong or MongoDB isn't running — check `mongod` is up |
| Astro pages show sample/placeholder books forever | `PUBLIC_API_URL`/`API_URL` in `frontend-astro/.env` don't match where the backend is actually running, or the backend has no books yet |
| CORS errors in the browser console | `FRONTEND_URL` in `backend/.env` doesn't match the Astro origin exactly (protocol + port) |
| `⚠️ PhonePe configuration incomplete` on backend boot | Expected with placeholder keys — fine for local dev, fix before enabling real checkout |
| Login/register works but "My Library" is always empty | Expected until a purchase exists — `paymentState: 'COMPLETED'` is required for a purchase to show up |
| 404 on every Astro page except home | You're running `astro preview`/`node dist/...` without `npm run build` first, or an old `dist/` — rebuild |

---

## 9. What's already covered vs. what needs the admin UI

Covered end-to-end and working: browsing, filtering, book/course detail
pages, dark/light + language toggle, register, login, forgot password,
dashboard, my library (re-download of completed purchases).

Not yet built: the **admin panel UI** (book/course upload forms, manage
listings) and the **payment checkout** flow on the "Buy" buttons — for now
those buttons link to `/login?next=...` as a placeholder, and new content
has to go in via the API calls shown in step 5 (or your existing Next.js
admin panel, which still works against this same backend). Say the word
when you want that phase built.
