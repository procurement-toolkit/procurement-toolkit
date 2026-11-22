// Applies query-aligned title/description/keywords (from real Google autocomplete) to pages.
// Usage: node scripts/seo/apply_meta.mjs [--dry]
import fs from 'fs';
const esc = s => s.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
const M = JSON.parse(fs.readFileSync(new URL('./meta-map.json', import.meta.url)));
const dry = process.argv.includes('--dry');
let n = 0;
for (const [file, m] of Object.entries(M)) {
  if (!fs.existsSync(file)) { console.log('missing', file); continue; }
  let s = fs.readFileSync(file, 'utf8'); const o = s;
  const t = esc(m.title), d = esc(m.desc);
  s = s.replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`);
  s = s.replace(/(<meta name="description" content=")[^"]*"/, `$1${d}"`);
  s = s.replace(/(<meta property="og:title" content=")[^"]*"/, `$1${t}"`);
  s = s.replace(/(<meta property="og:description" content=")[^"]*"/, `$1${d}"`);
  s = s.replace(/(<meta name="twitter:title" content=")[^"]*"/, `$1${t}"`);
  s = s.replace(/(<meta name="twitter:description" content=")[^"]*"/, `$1${d}"`);
  if (m.kw) s = s.replace(/(<meta name="keywords" content=")[^"]*"/, `$1${esc(m.kw)}"`);
  if (s !== o) { n++; if (!dry) fs.writeFileSync(file, s); }
}
console.log((dry ? 'would update ' : 'updated ') + n + ' files');
