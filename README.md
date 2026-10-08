# Word Hunt Solver (wordhuntsolvers.com)

Built with Astro, React islands, and Tailwind CSS v4. Every page ships as static HTML.
The Solver and Board Evolver are small React islands. Hosting: Hostinger.

## Local development
```bash
npm install
npm run dev
```

## Build and deploy
```bash
npm run build
```
Output goes to `dist/`. Pushing to `main` runs `.github/workflows/build-and-deploy.yml`,
which builds the site and uploads `dist/` to Hostinger over FTPS (when `DEPLOY_ENABLED` is `true`).
`public/.htaccess` is copied into `dist/` automatically. It handles https and www, clean URLs,
the 301 redirect from `/guides/free-word-finder`, the custom 404 page, compression, and caching.

## Pages
- `/` Homepage with the solver, video, table of contents, and FAQ
- `/evolver` Board Evolver
- `/guides` Guides hub
- `/guides/word-hunt-tips`, `/guides/word-hunt-cheat`, `/guides/word-hunt-solver-vs-word-finder`
- `/about`, `/contact`, `/privacy-policy`, `/terms-and-conditions`
- `404.html` custom not found page (noindex)
- `/sitemap.xml` (submit this in Search Console) and `robots.txt`

## Things the owner adds
1. Web3Forms access key: in `src/pages/contact.astro`, replace `YOUR_ACCESS_KEY_HERE`.
2. Google Analytics: paste the GA4 tag in `src/layouts/Layout.astro` at the marked spot,
   after the consent code. Do not move it above the consent code.
3. When a page's content changes, update its date in `src/pages/sitemap.xml.ts`, and for guides,
   the "Updated" date and `dateModified` on that page.

## Notes
- Word list: `public/dictionary.txt`, the full ENABLE word list (every word of 3 letters or more).
- Scoring above 8 letters is not confirmed, so 9+ letter words show as 2,200+.
- Screenshot upload runs fully in the browser (`src/lib/boardScan.ts`, `src/lib/scanUpload.ts`).
  Accepted formats: PNG, JPG, WebP. Nothing is uploaded to a server.
- Cookie banner shows for visitors with a European time zone. Google Consent Mode keeps
  Analytics off by default for the UK, EEA, and Switzerland until they accept.
