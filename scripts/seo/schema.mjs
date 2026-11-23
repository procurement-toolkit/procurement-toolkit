// Adds canonical, hreflang pairs, BreadcrumbList and WebApplication JSON-LD to tool pages that have a guide. Idempotent (marker-delimited).
import fs from 'fs';
const BASE = 'https://procurement-toolkit-eight.vercel.app/';
const PAIR = { 'cbm.html': 'en/cbm-calculator.html', 'container-loading-visualizer.html': 'en/container-loading-calculator.html' };
const files = [...fs.readdirSync('.').filter(f => f.endsWith('.html')), ...fs.readdirSync('en').filter(f => f.endsWith('.html')).map(f => 'en/' + f)];
const koOf = f => f.startsWith('en/') ? (Object.entries(PAIR).find(([, v]) => v === f)?.[0] || f.slice(3)) : f;
const enOf = f => PAIR[f] || 'en/' + f;
const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<');
let n = 0;
for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  if (!s.includes('<!--SEOGUIDE-->')) continue;
  const en = f.startsWith('en/'), ko = koOf(f), e = enOf(ko), hasPair = fs.existsSync(e) && fs.existsSync(ko);
  const url = BASE + f;
  let head = '';
  if (!/rel="canonical"/.test(s)) head += `<link rel="canonical" href="${url}">\n`;
  if (hasPair && !/hreflang=/.test(s)) head += `<link rel="alternate" hreflang="ko" href="${BASE + ko}">\n<link rel="alternate" hreflang="en" href="${BASE + e}">\n<link rel="alternate" hreflang="x-default" href="${BASE + ko}">\n`;
  const title = decode((s.match(/<title>([\s\S]*?)<\/title>/) || [, f])[1]).replace(/\s*[|—–-]\s*CBM\s?Lab\s*$/i, '').trim();
  const isTool = /(calculator|tool|generator|matrix|visualizer|dashboard|scorecard|analysis|comparator|grid|cbm|fob-cif)/.test(f) && !/guide\.html$|calendar\.html$|hub\.html$/.test(f);
  const ld = [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemList: undefined, itemListElement: [{ '@type': 'ListItem', position: 1, name: 'CBM Lab', item: BASE + (en ? 'en/index.html' : 'index.html') }, { '@type': 'ListItem', position: 2, name: en ? 'Tools' : '도구', item: BASE + (en ? 'en/index.html' : 'index.html') + '#tools' }, { '@type': 'ListItem', position: 3, name: title, item: url }] }];
  if (isTool) ld.push({ '@context': 'https://schema.org', '@type': 'WebApplication', name: title, url, inLanguage: en ? 'en' : 'ko', applicationCategory: 'BusinessApplication', operatingSystem: 'Any (web browser)', offers: { '@type': 'Offer', price: '0', priceCurrency: en ? 'USD' : 'KRW' }, publisher: { '@type': 'Organization', name: 'CBM Lab', url: BASE } });
  const block = `<!--SEOSCHEMA-->\n${head}${ld.map(x => `<script type="application/ld+json">${JSON.stringify(x)}</script>`).join('\n')}\n<!--/SEOSCHEMA-->\n`;
  s = s.replace(/<!--SEOSCHEMA-->[\s\S]*?<!--\/SEOSCHEMA-->\n?/, '');
  s = s.replace(/<\/head>/i, block + '</head>');
  fs.writeFileSync(f, s); n++;
}
console.log('schema applied', n);
