# BooksPDF — Cloudflare Workers migration

- **`backend-workers/`** — the new backend: rewritten to run on Cloudflare
  Workers and connect to MongoDB Atlas directly. **Start here.** See
  `backend-workers/README.md` for what changed and how to deploy.
- **`frontend-astro/`** — the original Astro frontend, unchanged except for
  a comment added to `.env.example` pointing `PUBLIC_API_URL`/`API_URL` at
  your deployed Worker. No code changes were needed — it already talked to
  the API purely over `fetch` with a configurable base URL.
- **`backend-original-express/`** — your original Express/Mongoose backend,
  kept as-is for reference/diffing. Not needed for deployment once you've
  switched to `backend-workers/`.

## Quick start

1. `cd backend-workers && npm install`
2. Create a MongoDB Atlas cluster (or reuse your existing one) and set
   Network Access to `0.0.0.0/0` (see `backend-workers/README.md` for why).
3. Set secrets and deploy — full steps in `backend-workers/README.md`.
4. `cd ../frontend-astro`, set `PUBLIC_API_URL`/`API_URL` in `.env` to your
   deployed Worker's URL, then deploy the frontend as you normally would.

Read `backend-workers/README.md` in full before deploying — in particular
the **Thumbnails** section (server-side image resizing via `sharp` isn't
possible in Workers, and needs a small client-side or WASM-based swap).
