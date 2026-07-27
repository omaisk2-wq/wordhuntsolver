const SITE = "https://www.wordhuntsolvers.com";

const pages = [
  { path: "/", priority: "1.0" },
  { path: "/evolver", priority: "0.8" },
  { path: "/guides", priority: "0.8" },
  { path: "/guides/word-hunt-cheat", priority: "0.7" },
  { path: "/guides/free-word-finder", priority: "0.7" },
  { path: "/guides/wordscapes-help", priority: "0.7" },
  { path: "/contact", priority: "0.5" },
  { path: "/privacy-policy", priority: "0.3" },
  { path: "/terms-and-conditions", priority: "0.3" },
];

export async function GET() {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (p) => `  <url>
    <loc>${SITE}${p.path}</loc>
    <priority>${p.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>
`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml" },
  });
}
