# Books PDF — complete project (Astro frontend + Express backend)

```
bookspdf-complete/
├── frontend-astro/   ← new Astro site (Phase 1 + 2, see frontend-astro/README.md)
└── backend/          ← your original Express/MongoDB backend, with the
                         additive Course model/routes/controller merged in
                         (nothing existing was removed or renamed)
```

## Run it

**Backend** (unchanged setup — same as before):
```bash
cd backend
npm install
# your existing .env (Mongo URI, JWT secret, PhonePe keys, Resend key, etc.)
npm start        # http://localhost:5000
```

**Frontend:**
```bash
cd frontend-astro
npm install
cp .env.example .env   # PUBLIC_API_URL=http://localhost:5000/api
npm run dev             # http://localhost:4321
```

See `frontend-astro/README.md` for what's built (public SEO pages, dark/light
+ language toggle, auth, dashboard, my library) and what's left (admin panel
+ course upload UI, payment checkout wiring) — that's the next phase whenever
you're ready to continue.

Your existing Next.js app in this same repo (`books-pdf/`) is untouched and
still works if you want to run both side by side while you migrate.

**For full setup instructions (env vars, running both servers, adding your
first book/course, production build, troubleshooting), see [`SETUP.md`](./SETUP.md).**
