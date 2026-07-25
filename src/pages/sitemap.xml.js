// A conventional /sitemap.xml entry point (what most site owners submit to
// Google Search Console / Bing Webmaster Tools) that simply indexes the two
// sitemaps this project already generates:
//   - /sitemap-index.xml  -> static pages, produced at build time by @astrojs/sitemap
//   - /sitemap-books.xml  -> live book & course URLs, produced on request by sitemap-books.xml.js
export async function GET(context) {
  const site = (context.site ?? new URL(context.request.url).origin).toString().replace(/\/$/, '');

  const sitemaps = [
    `${site}/sitemap-index.xml`,
    `${site}/sitemap-books.xml`,
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps.map((u) => `  <sitemap><loc>${u}</loc></sitemap>`).join('\n')}
</sitemapindex>`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml' },
  });
}
