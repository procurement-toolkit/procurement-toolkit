// Inserts a crawlable "related tools" block (same category + language) into each tool page. Idempotent.
// Usage: node scripts/seo/related_links.mjs [--dry]
import fs from 'fs';
import vm from 'vm';
const dry = process.argv.includes('--dry');
function load(p) {
  const s = fs.readFileSync(p, 'utf8');
  const tools = s.match(/const TOOLS = (\[[\s\S]*?\n\]);/)[1];
  return vm.runInNewContext(`(${tools})`);
}
const CSS = '.related-tools{max-width:960px;margin:32px auto;padding:0 16px}.related-tools h2{font-size:15px;font-weight:700;margin:0 0 10px}.related-tools ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}.related-tools a{display:block;padding:10px 12px;border:1px solid #E2E8F0;border-radius:8px;font-size:13px;color:#1E293B;text-decoration:none}.related-tools a:hover{border-color:#94A3B8}';
let n = 0;
for (const [home, prefix, heading] of [['index.html', '', '함께 쓰는 관련 도구'], ['en/index.html', 'en/', 'Related tools']]) {
  const T = load(home);
  for (const t of T) {
    const file = prefix + t.href.replace(/^\.?\//, '');
    if (!/\.html$/.test(t.href) || t.href.includes('/') || !fs.existsSync(file)) continue;
    let s = fs.readFileSync(file, 'utf8'); const o = s;
    s = s.replace(/<!--RELATED-->[\s\S]*?<!--\/RELATED-->\n?/, '');
    // same category first, then others; deterministic, 6 items, never self
    const same = T.filter(x => x.cat === t.cat && x.href !== t.href);
    const rest = T.filter(x => x.cat !== t.cat);
    const idx = T.indexOf(t);
    const rot = a => a.map((_, i) => a[(i + idx) % a.length]);
    const pick = [...rot(same), ...rot(rest)].slice(0, 6);
    const li = pick.map(x => `<li><a href="${x.href}">${x.title.replace(/&(?!amp;)/g, '&amp;')}</a></li>`).join('');
    const blk = `<!--RELATED--><nav class="related-tools" aria-label="${heading}"><h2>${heading}</h2><ul>${li}</ul></nav><!--/RELATED-->`;
    if (!s.includes('.related-tools{')) s = s.replace('</style>', CSS + '\n</style>');
    if (/<footer/.test(s)) s = s.replace(/<footer/, blk + '\n<footer'); else s = s.replace('</body>', blk + '\n</body>');
    if (s !== o) { n++; if (!dry) fs.writeFileSync(file, s); }
  }
}
console.log((dry ? 'would update ' : 'updated ') + n);
