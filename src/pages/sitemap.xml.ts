const SITE = "https://www.wordhuntsolvers.com";

// Update a page's lastmod date only when that page's content actually changes.
const pages = [
  { path: "", lastmod: "2026-10-08" },
  { path: "/evolver", lastmod: "2026-10-08" },
  { path: "/guides", lastmod: "2026-10-08" },
  { path: "/guides/word-hunt-tips", lastmod: "2026-10-08" },
  { path: "/guides/word-hunt-cheat", lastmod: "2026-10-08" },
  { path: "/guides/word-hunt-solver-vs-word-finder", lastmod: "2026-10-08" },
  { path: "/about", lastmod: "2026-10-08" },
  { path: "/contact", lastmod: "2026-10-08" },
  { path: "/privacy-policy", lastmod: "2026-10-08" },
  { path: "/terms-and-conditions", lastmod: "2026-10-08" },
];

export async function GET() {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (p) => `  <url>
    <loc>${SITE}${p.path}</loc>
    <lastmod>${p.lastmod}</lastmod>
  </url>`
  )
  .join("\n")}
</urlset>
`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml" },
  });
}
