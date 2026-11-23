// Keeps sitemap.xml in sync: drops URLs whose file is gone or noindex, adds evergreen generated pages. Idempotent.
import fs from 'fs';
import { execSync } from 'child_process';
const lm = f => { try { return execSync(`git log -1 --format=%cs -- "${f}"`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const BASE = 'https://procurement-toolkit-eight.vercel.app/';
const GEN_DIRS = ['fairs', 'en/fairs', 'fairs/country', 'en/fairs/country', 'fairs/f', 'en/fairs/f', 'recalls', 'bids', 'en/bids', 'bids/country', 'en/bids/country','bids/guide','en/bids/guide'];             // evergreen generated sections (every .html inside is indexable)
const s = fs.readFileSync('sitemap.xml', 'utf8');
const meta = new Map([...s.matchAll(/<url><loc>([^<]+)<\/loc>(.*?)<\/url>/g)].map(m => [m[1], m[2]]));
const out = new Map();
for (const [u, rest] of meta) {
  const f = u === BASE ? 'index.html' : u.slice(BASE.length);
  if (!fs.existsSync(f)) continue;
  if (/name=["']robots["'][^>]*noindex/i.test(fs.readFileSync(f, 'utf8'))) continue;
  out.set(u, rest);
}
for (const d of GEN_DIRS) {
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d).filter(x => x.endsWith('.html'))) {
    const u = BASE + d + '/' + f;
    if (!out.has(u)) out.set(u, `<changefreq>weekly</changefreq><priority>${f === 'index.html' ? '0.8' : '0.6'}</priority>`);
  }
}
const x = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + [...out].map(([u, r]) => { const f = u === BASE ? 'index.html' : u.slice(BASE.length); const d = lm(f); return `  <url><loc>${u}</loc>${d ? `<lastmod>${d}</lastmod>` : ''}${r.replace(/<lastmod>[^<]*<\/lastmod>/, '')}</url>`; }).join('\n') + '\n</urlset>\n';
if (x !== s) { fs.writeFileSync('sitemap.xml', x); console.log('sitemap updated:', out.size, 'urls'); } else console.log('sitemap unchanged:', out.size);
