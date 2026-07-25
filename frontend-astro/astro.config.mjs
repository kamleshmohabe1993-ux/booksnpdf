import { defineConfig, passthroughImageService } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';

// Books PDF — Astro rebuild
// SSR output so book/course detail pages and filtered listings can pull
// live data from the existing Express API on every request (fresh SEO
// content, no stale static builds every time a book is added).
//
// Deployed on Cloudflare Pages/Workers via @astrojs/cloudflare — see
// wrangler.toml in this directory. (Previously used @astrojs/node for
// local/VPS hosting; swapped when moving to Cloudflare.)
export default defineConfig({
  site: 'https://bookspdf.com',
  output: 'server',
  adapter: cloudflare({
    imageService: 'passthrough',
  }),
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
