# Word Hunt Solver — wordhuntsolver.ai

Built with **Astro + React islands + Tailwind CSS v4**. Every page ships as pure static HTML
(zero JavaScript by default) except the Solver and Evolver tools, which hydrate as isolated
React islands.

## Local development
```bash
npm install
npm run dev
```

## Build for production
```bash
npm run build
```
Output goes to `dist/` — upload this entire folder to Hostinger's `public_html`.

## Deploying to Hostinger
1. Run `npm run build`
2. Upload the contents of `dist/` to your Hostinger `public_html` folder
3. Point wordhuntsolver.ai at that hosting account
4. Submit `https://www.wordhuntsolver.ai/sitemap-index.xml` in Google Search Console

## What's included
- `/` — Homepage with the Word Hunt Solver tool, guides section, FAQs, schema
- `/evolver` — Board Evolver tool (genetic algorithm)
- `/guides` — Guides hub page
- `/guides/word-hunt-cheat`, `/guides/free-word-finder`, `/guides/wordscapes-help` — 3 articles
- `/privacy-policy`, `/terms-and-conditions`, `/contact` — legal/support pages
- `robots.txt` and an auto-generated `sitemap-index.xml`
- Dark/light mode toggle
- FAQPage, BreadcrumbList, Organization, WebSite JSON-LD schema
- `public/dictionary.txt` — ENABLE1 word list (152k words), the same style of dictionary
  used by Scrabble-type games, filtered to 3-12 letter words
- `public/og/default.png` — brand OG image used on homepage, legal, and support pages

## Still needed before going fully live
1. Google Analytics ID: open src/layouts/Layout.astro, find the commented GA4 block, add your
   real Measurement ID, and uncomment it.
2. Contact form backend: the form on /contact is not wired to send anywhere yet, connect it to a
   service like Formspree or Resend. Until then, the direct email (wordhuntsolver@gmail.com) works.
3. Article feature images: each article currently falls back to the default OG image. Once you
   have a feature image per article, pass it via the ogImage prop on that page's Layout.
4. 7 remaining articles: only 3 of the planned 10 are built. Add the rest under src/pages/guides/,
   following the existing file pattern.
5. Ad network (if any): the Privacy Policy has one bracketed line reserved for this.

## SEO/technical notes
- 100% static HTML, verified in the raw build output
- Organization + WebSite schema site-wide, FAQPage + BreadcrumbList on articles
- Canonical tags, Open Graph, Twitter cards on every page
- No fabricated claims anywhere
