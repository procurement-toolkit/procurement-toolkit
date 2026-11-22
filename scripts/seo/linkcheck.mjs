// Internal link checker (html files only, skips noindex archives' own inbound noise). Usage: node scripts/seo/linkcheck.mjs [--json out.json]
import fs from 'fs'; import path from 'path';
const roots = ['.', 'en', 'recalls', 'naewichi'];
const files = roots.flatMap(d => fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith('.html')).map(f => path.join(d, f)) : []);
const broken = [];
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
  for (const m of s.matchAll(/<a\s[^>]*href=["']([^"']+)["']/gi)) {
    let h = m[1].split('#')[0].split('?')[0]; if (!h || /^(https?:|mailto:|tel:|javascript:|data:)/i.test(h)) continue;
    const t = h.startsWith('/') ? (h.slice(1) || '.') : path.join(path.dirname(f), h);
    const p = fs.existsSync(t) && fs.statSync(t).isDirectory() ? path.join(t, 'index.html') : t;
    if (!fs.existsSync(p)) broken.push({ from: f, href: m[1] });
  }
}
const j = process.argv.indexOf('--json'); if (j > 0) fs.writeFileSync(process.argv[j + 1], JSON.stringify(broken, null, 1));
console.log(`linkcheck: ${files.length} files, ${broken.length} broken`); for (const b of broken.slice(0, 40)) console.log(` ${b.from} -> ${b.href}`);
