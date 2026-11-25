// Idempotently adds Vercel Web Analytics to every HTML page (so generated fairs/bids pages are measured too).
import fs from 'node:fs';
import path from 'node:path';
const TAG = '<script>window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };</script>\n<script defer src="/_vercel/insights/script.js"></script>\n';
const SKIP = new Set(['node_modules', '.git', '.github', 'reports']);
let n = 0, seen = 0;
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!e.name.endsWith('.html') || /^google[0-9a-f]+\.html$/.test(e.name)) continue;
    const h = fs.readFileSync(p, 'utf8'); seen++;
    if (h.includes('_vercel/insights') || !h.includes('</head>')) continue;
    fs.writeFileSync(p, h.replace('</head>', TAG + '</head>')); n++;
  }
})('.');
console.log(`analytics: ${n} pages updated, ${seen} scanned`);
