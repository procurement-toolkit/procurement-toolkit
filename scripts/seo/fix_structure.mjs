// Objective, idempotent structural SEO fixes. Usage: node scripts/seo/fix_structure.mjs [--dry]
import fs from 'fs';
import path from 'path';
const BASE = 'https://procurement-toolkit-eight.vercel.app';
const dry = process.argv.includes('--dry');
const skip = new Set(['google', 'naver']);
const files = [...fs.readdirSync('.').filter(f => f.endsWith('.html')),
  ...fs.readdirSync('en').filter(f => f.endsWith('.html')).map(f => 'en/' + f)];
const st = { h2: 0, canon: 0, og: 0, ld: 0, h1: 0 };
for (const f of files) {
  if (skip.has(f.split('.')[0]) || /^(google|naver)[^/]*\.html$/.test(f)) continue;
  let s = fs.readFileSync(f, 'utf8'); const o = s;
  if (/noindex/.test(s)) continue;
  const url = `${BASE}/${f}`;
  const title = (s.match(/<title>([^<]*)<\/title>/) || [])[1];
  const desc = (s.match(/name="description" content="([^"]*)"/) || [])[1];
  if (!title || !desc) continue;
  // card-title div -> h2 (only simple inner content)
  if (/<div class="card-title"/.test(s)) {
    s = s.replace(/<div class="card-title"([^>]*)>((?:(?!<div|<\/div>)[\s\S])*?)<\/div>/g, (m, a, b) => { st.h2++; return `<h2 class="card-title"${a}>${b}</h2>`; });
    if (/<h2 class="card-title"/.test(s) && !/h2\.card-title\{/.test(s))
      s = s.replace(/(\.card-title\{[^}]*\})/, '$1\n  h2.card-title{margin:0;line-height:1.4}');
  }
  if (!/rel="canonical"/.test(s)) { s = s.replace('</title>', `</title>\n<link rel="canonical" href="${url}">`); st.canon++; }
  if (!/property="og:title"/.test(s)) {
    const lang = /<html lang="en"/.test(s) ? 'en_US' : 'ko_KR';
    s = s.replace(/(<link rel="canonical"[^>]*>)/, `$1\n<meta property="og:type" content="website">\n<meta property="og:site_name" content="CBM Lab">\n<meta property="og:locale" content="${lang}">\n<meta property="og:title" content="${title}">\n<meta property="og:description" content="${desc}">\n<meta property="og:url" content="${url}">\n<meta property="og:image" content="${BASE}/assets/hero-team.jpg">\n<meta name="twitter:card" content="summary_large_image">`);
    st.og++;
  }
  if (!/application\/ld\+json/.test(s)) {
    const lang = /<html lang="en"/.test(s) ? 'en' : 'ko';
    const ld = { '@context': 'https://schema.org', '@type': 'WebPage', name: title.replace(/&amp;/g, '&'), description: desc.replace(/&amp;/g, '&'), url, inLanguage: lang, isPartOf: { '@type': 'WebSite', name: 'CBM Lab', url: BASE + '/' } };
    s = s.replace('</head>', `<script type="application/ld+json">${JSON.stringify(ld)}</script>\n</head>`); st.ld++;
  }
  if (s !== o) { if (!dry) fs.writeFileSync(f, s); }
}
console.log(dry ? 'dry' : 'applied', JSON.stringify(st));
