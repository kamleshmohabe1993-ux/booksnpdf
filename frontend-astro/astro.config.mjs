import { defineConfig, passthroughImageService } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';

// Books PDF — Astro rebuild
// SSR output so book/course detail pages and filtered listings can pull
// live data from the backend API on every request (fresh SEO content, no
// stale static builds every time a book is added).
//
// Adapter: @astrojs/cloudflare (not @astrojs/node) so this builds to a
// Cloudflare Pages Function / Worker and can be deployed alongside the
// backend-workers/ API on Cloudflare. `@astrojs/node`'s `standalone` mode
// starts a long-lived Node HTTP server listening on a port — that model
// doesn't exist on Cloudflare's edge runtime, so it can't be deployed there
// as-is. If you deploy this frontend somewhere else (Render, Railway, a
// VPS, etc.) instead, swap back to @astrojs/node.
export default defineConfig({
  site: 'https://bookspdf.com',
  output: 'server',
  adapter: cloudflare({ imageService: 'passthrough' }),
  image: {
    // Astro's default image service shells out to Sharp, which needs a
    // native binary that isn't available on Cloudflare Pages/Workers (or
    // most other edge runtimes). The passthrough service still lets us use
    // the <Image> component from 'astro:assets' — with its automatic
    // width/height (no layout shift) and alt-text enforcement — it just
    // skips server-side resizing/format conversion, so this works
    // unchanged if the app is later deployed on Cloudflare.
    service: passthroughImageService(),
  },
  integrations: [
    react(),
    tailwind({ applyBaseStyles: false }),
    sitemap(),
  ],
  server: {
    port: 4321,
  },
});
