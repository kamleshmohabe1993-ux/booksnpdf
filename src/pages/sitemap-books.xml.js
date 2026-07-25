import { getBooks, getCourses } from '../lib/api.js';

export async function GET(context) {
  const site = (context.site ?? new URL(context.request.url).origin).toString().replace(/\/$/, '');
  const [{ books }, { courses }] = await Promise.all([
    getBooks({ sort: 'newest' }),
    getCourses({ sort: 'newest' }),
  ]);

  const urls = [
    ...books.map((b) => `${site}/books/${b.slug || b._id}`),
    ...courses.map((c) => `${site}/courses/${c.slug || c._id}`),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml' },
  });
}
