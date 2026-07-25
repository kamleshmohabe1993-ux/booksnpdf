# BooksPDF API — Cloudflare Workers + MongoDB Atlas

This is a rewrite of the original Express/Mongoose backend
(`backend/`) so it runs on **Cloudflare Workers** and talks to
**MongoDB Atlas** directly (no separate REST proxy). It implements the
exact same routes, request/response shapes, and business logic as the
original — the Astro frontend needs **no code changes**, only a new
`PUBLIC_API_URL` / `API_URL` pointing at the deployed Worker.

## What changed, and why

Cloudflare Workers is a V8-isolate runtime, not Node.js, so anything that
depended on a Node-only API had to be swapped for a Workers-compatible
equivalent:

| Original | Used for | Replaced with |
|---|---|---|
| `mongoose` | ODM / MongoDB access | Official `mongodb` driver, called directly, over the `node:net`/`node:tls` support Cloudflare added behind the `nodejs_compat` flag. Schema defaults, `pre('save')` hooks (password hashing, slug generation, `averageRating` recalculation) are now explicit code in the route handlers — see `src/utils/slugify.js`, `src/routes/ratings.js`. |
| `jsonwebtoken` | Auth tokens | `jose` (built on Web Crypto, works natively in Workers) |
| `google-auth-library` | Verifying Google Sign-In tokens | Direct JWKS verification via `jose`'s `createRemoteJWKSet` |
| Node `crypto` | Random tokens, SHA-256 webhook auth | Web Crypto (`crypto.getRandomValues`, `crypto.subtle.digest`) — see `src/lib/crypto.js` |
| `axios` (in `phonepeSDK.js`) | PhonePe V2 API calls | `fetch` — see `src/utils/phonepe.js` |
| `resend` SDK | Sending OTP emails | Direct `fetch` to `https://api.resend.com/emails` (the SDK is just a thin wrapper around this anyway) |
| `sharp` | Resizing/compressing thumbnails | **Not replaced** — no native binary can run in a Workers isolate. See "Thumbnails" below. |
| `multer` | — | Wasn't actually used anywhere in the original code (dead dependency), so nothing to port. |
| Mongoose's implicit index creation | Unique/TTL indexes | Explicit `createIndex` calls in `src/db.js`, run once per isolate |

`bcryptjs` needed no changes — it's pure JS.

**Dead code that was intentionally *not* ported:** `controllers/auth.js`
(an unused duplicate of `middleware/auth.js`) and
`controllers/transactionsController.js` (not wired into any route — the
original `routes/payments.js` actually imports its transaction handlers
from `paymentController.js`).

## MongoDB Atlas from a Worker

The Atlas **Data API** (the old REST-over-HTTPS option some older guides
suggest) was **deprecated by MongoDB in 2025** — don't use it. Instead,
this project uses the real `mongodb` driver with a genuine TCP/TLS
connection, which Cloudflare Workers has supported since it added
`node:net`/`node:tls` behind the `nodejs_compat` compatibility flag
(already set in `wrangler.toml`).

Two things to configure in Atlas:

1. **Network Access**: add `0.0.0.0/0`. Workers egress from Cloudflare's
   edge, not a fixed IP range, so you can't whitelist a specific CIDR.
2. **Cluster tier**: an M0/M2/M5 shared tier will work for low traffic,
   but each Worker isolate opens its own small connection pool
   (`maxPoolSize: 5` in `src/db.js`), and busy traffic can spin up many
   isolates. If you see connection-limit errors under load, either raise
   `maxPoolSize`/cluster tier, or reduce `maxPoolSize` further — there's
   no Hyperdrive-style connection pooling for MongoDB (Hyperdrive
   currently only supports Postgres/MySQL).

### ⚠️ Known risk: the `mongodb` driver is not reliably confirmed working on Workers

This is the single biggest open question in this migration, and it's worth
testing `GET /api/health` immediately after your first deploy before relying
on anything else here.

Cloudflare added `node:net`/`node:tls` support behind `nodejs_compat` (and a
`connect()`-based TCP Sockets API), and the official `mongodb` driver is
built on top of `net.Socket`/`tls.TLSSocket`, which is why this migration
was attempted this way. In practice, developer reports (see
[cloudflare/workerd#2721](https://github.com/cloudflare/workerd/discussions/2721))
describe the driver failing to actually connect even with the newer
compatibility flags on — both `querySrv` DNS resolution for
`mongodb+srv://` URIs failing outright, and plain connections dropping with
reset errors. This may have improved since (Cloudflare's Node.js
compatibility work is under active, fast-moving development), which is why
this is flagged as a risk to verify rather than a guaranteed break — but
don't assume it works untested.

If `/api/health` reports the database as unreachable, or you hit connection
errors under real use, here are the practical paths forward, roughly
easiest-to-hardest:

1. **Use a plain (non-SRV) connection string.** In Atlas, get the
   "Standard connection string" (`mongodb://host1:27017,host2:27017,.../db?...`)
   instead of `mongodb+srv://`. This avoids the SRV DNS lookup specifically,
   though it doesn't guarantee the underlying socket layer works.
2. **Put a small proxy in front of MongoDB.** Run a thin HTTP-to-MongoDB
   proxy (a tiny Express/Fastify service exposing REST endpoints backed by
   Mongoose) on a normal Node host (Render, Fly.io, Railway, a small VPS),
   and have the Worker call that proxy over `fetch` instead of connecting
   to MongoDB directly. Keeps the Worker for CORS/auth/edge logic while
   sidestepping the driver issue entirely.
3. **Don't run the API on Workers.** Deploy `backend-original-express/`
   (unchanged) to a normal Node host instead, and only use Cloudflare for
   the frontend (Cloudflare Pages) and/or a caching Worker in front of the
   Express API. This is the safest option if you need this working today
   without further testing.
4. **Migrate off MongoDB to a Workers-native store.** Cloudflare D1
   (SQLite) or Postgres via Hyperdrive are both first-class on Workers with
   no socket-compatibility questions — but this means rewriting the data
   layer (models, queries, migrations), which is a bigger lift than it
   sounds given how much of this app's logic lives in Mongoose
   hooks/schemas.

There's no single "correct" fix here — it depends on how much of this
you're willing to re-architect versus ship as-is. Test `/api/health`
against your real Atlas cluster before deciding.

## Thumbnails (read before deploying)

The original used `sharp` to resize covers to 400×600 JPEG before storing
them as base64. Sharp needs a native binary, which can't run in a Workers
isolate, so `src/utils/imageHelper.js` **validates and stores the image
as-is** — no resize/compress step.

Two ways to handle this:

1. **(Recommended, simplest)** Resize on the client before upload — add a
   `<canvas>`-based resize step to the admin book/course form before it
   base64-encodes the file. A few lines of JS, zero backend changes.
2. Swap in a WASM image library that *does* run in Workers (e.g.
   `@cf-wasm/photon`) inside `processImage()` in `src/utils/imageHelper.js`
   — the function signature is unchanged, so nothing else needs to move.

## Deploying

```bash
npm install
npx wrangler login

# Secrets (never put these in wrangler.toml — they're per-environment):
npx wrangler secret put MONGODB_URI
npx wrangler secret put JWT_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID          # optional, enables Google Sign-In
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put PHONEPE_CLIENT_ID
npx wrangler secret put PHONEPE_CLIENT_SECRET
npx wrangler secret put PHONEPE_WEBHOOK_USERNAME  # whatever you configure in the PhonePe dashboard
npx wrangler secret put PHONEPE_WEBHOOK_PASSWORD

# Edit the non-secret values (FRONTEND_URL, ADMIN_EMAIL, etc.) directly in wrangler.toml,
# then:
npx wrangler deploy
```

Local development: copy `.dev.vars.example` to `.dev.vars`, fill it in,
then `npm run dev` (this uses `wrangler dev`, which runs the real
Workers runtime locally, not a Node shim — the same code paths you'll
hit in production).

After deploying, hit `GET /api/health` once — this lazily creates the
admin user from `ADMIN_EMAIL`/`ADMIN_PASSWORD`, replicating what the
original did automatically on every `node server.js` boot (Workers have
no long-lived startup phase to hook into).

### PhonePe webhook & redirect URLs

In the PhonePe dashboard, point:
- **Webhook URL** → `https://<your-worker>/api/payments/webhook`
- The `redirectUrl` sent during checkout is built automatically from
  `FRONTEND_URL` (see `src/routes/payments.js`) — make sure that var is
  set to your real frontend origin, not the Worker's own URL.

### Google Sign-In

`GOOGLE_CLIENT_ID` must be the exact same OAuth Client ID as the
frontend's `PUBLIC_GOOGLE_CLIENT_ID` (same as in the original setup).

## Frontend compatibility

No frontend code changes are required. The Astro app talks to the API
purely over `fetch` with a configurable base URL
(`src/lib/api.js`, `authClient.js`, `paymentClient.js`, `adminClient.js`,
`ratingsClient.js` — see `frontend-astro/`), and every endpoint path,
method, and response shape here matches the original exactly. Just point
`PUBLIC_API_URL`/`API_URL` at your deployed Worker (see
`frontend-astro/.env.example`) and update `FRONTEND_URL` in this
backend's config to your frontend's real origin (for CORS).

Auth uses a `Bearer` token from `localStorage` on every request (see
`authClient.js`), not the `auth_token` cookie this API also sets — so
there's no cross-origin cookie/SameSite configuration to worry about
between a Workers-hosted API and wherever the frontend ends up (Pages,
Vercel, Netlify, etc.). The cookie is kept for parity with the original
but isn't load-bearing for authentication.

## Testing checklist before going live

- [ ] `GET /api/health` returns `success: true` and creates the admin user
- [ ] Register + login (local auth)
- [ ] Google Sign-In (if configured)
- [ ] Forgot password → OTP email arrives (via Resend) → reset works
- [ ] Create a book/course from the admin panel (thumbnail upload works —
      see the "Thumbnails" note above if you rely on server-side resizing)
- [ ] Free download flow
- [ ] Paid purchase → PhonePe sandbox checkout → webhook updates status →
      download token issued
- [ ] Admin: transactions list, refund, CSV export
- [ ] Ratings: add/update/delete, average recalculates on the book
