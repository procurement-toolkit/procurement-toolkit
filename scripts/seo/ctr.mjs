// CTR experiments: finds pages with impressions but weak CTR (from data/seo/gsc.json), logs a baseline, and later reports before/after.
// Usage: node scripts/seo/ctr.mjs  -> prints markdown lines for the weekly report
import fs from 'fs';
const gp = 'data/seo/gsc.json', ep = 'data/seo/ctr-experiments.json';
const today = new Date().toISOString().slice(0, 10);
const gsc = fs.existsSync(gp) ? JSON.parse(fs.readFileSync(gp, 'utf8')) : { rows: [] };
const exp = fs.existsSync(ep) ? JSON.parse(fs.readFileSync(ep, 'utf8')) : {};
const pg = {};
for (const r of gsc.rows || []) { const [u, q] = r.keys; const p = (pg[u] ||= { impr: 0, clicks: 0, pos: 0, q: [] }); p.impr += r.impressions; p.clicks += r.clicks; p.pos += r.position * r.impressions; p.q.push([q, r.impressions]); }
const out = [];
for (const [u, p] of Object.entries(pg)) {
  const ctr = p.clicks / p.impr, pos = p.pos / p.impr, top = p.q.sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
  const e = exp[u];
  if (!e && p.impr >= 30 && ctr < 0.02 && pos <= 15) { exp[u] = { start: today, base: { impr: p.impr, clicks: p.clicks, ctr: +ctr.toFixed(4), pos: +pos.toFixed(1) }, topQueries: top }; out.push(`- NEW candidate ${u}: ${p.impr} impressions, CTR ${(ctr * 100).toFixed(1)}%, pos ${pos.toFixed(1)}; top queries: ${top.join(' / ')} -> title/description should lead with these`); }
  else if (e && !e.result && (Date.parse(today) - Date.parse(e.start)) / 864e5 >= 28) { e.result = { impr: p.impr, clicks: p.clicks, ctr: +ctr.toFixed(4), pos: +pos.toFixed(1), checked: today }; out.push(`- RESULT ${u}: CTR ${(e.base.ctr * 100).toFixed(1)}% -> ${(ctr * 100).toFixed(1)}% (${ctr > e.base.ctr ? 'improved' : 'no gain'})`); }
}
fs.writeFileSync(ep, JSON.stringify(exp, null, 1));
console.log(out.length ? out.join('\n') : `- no CTR candidates yet (${Object.keys(pg).length} pages with search data; needs >=30 impressions)`);
