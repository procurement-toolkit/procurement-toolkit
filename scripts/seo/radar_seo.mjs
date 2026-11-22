// Marks thin, auto-generated daily archive pages as noindex,follow so only evergreen pages compete in search.
// Idempotent. Usage: node scripts/seo/radar_seo.mjs
import fs from 'fs';
const DIRS = ['import-recall-radar', 'regulatory-radar', 'tenders', 'category-risk-signal', 'rates'];
const TAG = '<meta name="robots" content="noindex,follow">';
let n = 0;
for (const d of DIRS) {
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d).filter(x => x.endsWith('.html'))) {
    const p = `${d}/${f}`; let s = fs.readFileSync(p, 'utf8');
    if (/name=["']robots["']/i.test(s)) continue;
    const t = s.replace(/(<meta charset=["']?UTF-8["']?\s*\/?>)/i, `$1\n${TAG}`);
    if (t === s) continue;
    fs.writeFileSync(p, t); n++;
  }
}
console.log('noindex added to', n, 'pages');
