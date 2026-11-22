# SEO growth program
Weekly workflow `.github/workflows/seo-growth.yml` opens a PR (never pushes to main).
- `keywords.mjs` Google autocomplete for seeds in `data/seo/seeds.json` -> `data/seo/keywords.json`
- `meta-map.json` + `apply_meta.mjs` title/description/keywords per page (edit the map, script applies)
- `fix_structure.mjs` canonical/og/JSON-LD/h2 fixes; `related_links.mjs` internal link blocks (idempotent)
- `audit.mjs` rule-based audit/score; `grow.mjs` runs everything, logs `data/seo/experiments.json`, writes `reports/seo/DATE.md`
- `gsc.mjs` Search Console metrics (needs secrets GSC_SA_JSON, GSC_SITE; untested)
Loop: change meta-map -> merge -> compare GSC clicks/impressions per page after 2-4 weeks -> keep or revert.
