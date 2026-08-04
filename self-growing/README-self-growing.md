# Self-Growing Currency Snapshot — Setup Guide

This adds a small automated pipeline to CBM Lab that generates one brand-new
page every day, forever, with zero manual work after setup.

## What's in this folder

```
.github/workflows/daily-snapshot.yml   ← the automation (runs daily on GitHub's servers)
scripts/generate-daily-snapshot.js     ← the script that builds each new page
rates/                                 ← where generated pages will land (starts empty)
```

## One-time setup (about 5 minutes, only you can do this)

1. **Upload these files to your GitHub repo**, preserving the folder structure
   exactly as-is (the `.github/workflows/` path matters — GitHub only picks up
   workflows from that exact location).

2. **Turn on write permission for the automation.** In your repo:
   `Settings → Actions → General → Workflow permissions` → select
   **"Read and write permissions"** → Save.
   (This is required so the daily job is allowed to commit the new page it
   generates. Without this one checkbox, the automation will run but fail to
   push, and nothing will happen — no security risk either way, it just won't
   have permission until you flip this.)

3. **Test it manually once.** Go to the "Actions" tab in your repo → "Daily
   Currency Snapshot" → "Run workflow" button. This runs it immediately instead
   of waiting for the schedule, so you can confirm a new file appears in
   `rates/` and gets pushed.

4. **That's it.** From here on, it runs automatically every day at 07:00 KST.
   Vercel will pick up each new commit and deploy it automatically, same as
   any other change to the repo — no separate Vercel setup needed.

## What grows automatically

Every day, a new page like `rates/2026-08-05.html` appears with that day's
real KRW exchange rates against 8 currencies and a computed landed-cost impact
example. `rates/index.html` is rebuilt each time too, so the archive always
lists every snapshot that exists.

## Honest limitations (please read before relying on this)

- **This is a genuinely small source of traffic per page.** One currency
  snapshot page is not going to rank well on its own — the value compounds
  slowly, over months/years, as the archive grows and (ideally) some pages
  get linked to or cited elsewhere.
- **Frankfurter's free API has no published rate limit for normal use, but it's
  still a third-party service you don't control.** If it ever goes down or
  changes its response format, the daily job will fail silently until someone
  notices (check the "Actions" tab occasionally — a red X means it failed
  that day). This isn't zero-risk, it's zero-*routine*-labor.
- **This does not replace the earlier pieces** (landed cost calculator,
  supplier intelligence, sourcing desk, K-NSF guide) — it's a separate,
  smaller, genuinely passive experiment that can run alongside them.
- **If you ever want to expand this to other growing data sources** (e.g. new
  HS-code/tariff combinations, newly published certifications), the same
  pattern applies: a script that fetches + renders + writes a file, and a
  workflow that runs it on a schedule. Each new "growth engine" needs its own
  script, but it's the same shape as this one.
