// Applies Material Symbols (Apache-2.0, @material-symbols/svg-400 outlined) icons: home cards (distinct per tool) + a badge before each tool page <h1>.
// Idempotent. Requires: npm i @material-symbols/svg-400 (dir via ICON_DIR). Usage: ICON_DIR=/tmp/ms/node_modules/@material-symbols/svg-400/outlined node scripts/visual/apply_icons.mjs
import fs from 'fs'; import vm from 'vm';
const DIR = process.env.ICON_DIR || 'node_modules/@material-symbols/svg-400/outlined';
const MAP = JSON.parse(fs.readFileSync('scripts/visual/icon-map.json', 'utf8'));
const pathOf = n => fs.readFileSync(`${DIR}/${n}.svg`, 'utf8').match(/<path d="([^"]+)"/)[1];
const svg = (n, s) => `<svg width="${s}" height="${s}" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" focusable="false"><path d="${pathOf(n)}"/></svg>`;
const FALLBACK = 'apps';
const key = h => h.replace(/^.*\//, '').replace(/\.html$/, '');
let changed = 0;
// 1. home cards
for (const f of ['index.html', 'en/index.html']) {
  let s = fs.readFileSync(f, 'utf8'); const o = s;
  const used = new Set([FALLBACK]);
  s = s.replace(/\{cat:'(\w+)', icon:'(\w+)', title:'((?:[^'\\]|\\.)*)'([\s\S]*?)href:'([^']+)'/g, (m, cat, icon, title, mid, href) => {
    const name = MAP[key(href)] || FALLBACK; used.add(name);
    return `{cat:'${cat}', icon:'${name}', title:'${title}'${mid}href:'${href}'`;
  });
  const block = 'const ICONS = {\n' + [...used].sort().map(n => `  ${n}: '${svg(n, 20)}',`).join('\n') + '\n};';
  s = s.replace(/const ICONS = \{[\s\S]*?\n\};/, block);
  if (s !== o) { fs.writeFileSync(f, s); changed++; console.log('home icons ->', f, used.size, 'distinct'); }
}
// 2. page badges
const CSS = '.page-ic{display:inline-flex;align-items:center;justify-content:center;width:1.4em;height:1.4em;margin-right:.45em;vertical-align:-.2em;border-radius:.38em;background:rgba(128,128,128,.14)}.page-ic svg{width:.9em;height:.9em}';
for (const [dir, files] of [['', fs.readdirSync('.').filter(x => x.endsWith('.html'))], ['en/', fs.readdirSync('en').filter(x => x.endsWith('.html'))]]) for (const fn of files) {
  const k = key(fn); const n = MAP[k]; if (!n || k === 'privacy' || k === 'index') continue;
  const p = dir + fn; let s = fs.readFileSync(p, 'utf8'); const o = s;
  s = s.replace(/<!--IC-->[\s\S]*?<!--\/IC-->/, '');
  const m = s.match(/<h1\b[^>]*>/); if (!m) continue;
  s = s.replace(m[0], m[0] + `<!--IC--><span class="page-ic">${svg(n, 20)}</span><!--/IC-->`);
  if (!s.includes('.page-ic{')) s = s.replace('</style>', CSS + '\n</style>');
  if (s !== o) { fs.writeFileSync(p, s); changed++; }
}
console.log('files changed', changed);
