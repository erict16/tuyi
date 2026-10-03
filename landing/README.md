Static marketing page. Tailwind Plus **Salient** layout, 图译 Tuyi colors, real-app shots.

Live: https://erict16.github.io/tuyi/ (GitHub Pages from this folder).
English: `en.html`. `robots.txt` / `sitemap.xml` / `llms.txt` ship with it.

Hero video: `shots/hero.webm` + `shots/hero.mp4`, poster `shots/hero-poster.jpg`. Real Playwright screen recording of the app translating `tests/fixtures/floor_plan.dxf`.

Vercel: either set Root Directory to `landing`, or deploy the repo root; the root `vercel.json` rewrites `/`, `/en`, `/shots/*` and the SEO files into `landing/`.
