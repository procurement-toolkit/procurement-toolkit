// Self-growth loop: audit -> keyword coverage -> safe auto-fixes -> experiment log -> report.
// Never edits copy by itself beyond the idempotent structural fixers; content proposals go to the report for review.
// Usage: node scripts/seo/grow.mjs
import fs from 'fs';
import { execSync } from 'child_process';
const today = new Date().toISOString().slice(0, 10);
const run = c => execSync(c, { encoding: 'utf8' });
// 1. safe, idempotent fixers
const fixLog = [run('node scripts/seo/apply_meta.mjs'), run('node scripts/seo/fix_structure.mjs'), run('node scripts/seo/related_links.mjs')].map(s => s.trim());
// 2. audit
run('node scripts/seo/audit.mjs --json /tmp/_seo.json --md /tmp/_seo.md');
const audit = JSON.parse(fs.readFileSync('/tmp/_seo.json', 'utf8'));
const avg = Math.round(audit.reduce((a, p) => a + p.score, 0) / audit.length);
// 3. keyword coverage: which autocomplete phrases have terms absent from the page?
const kw = fs.existsSync('data/seo/keywords.json') ? JSON.parse(fs.readFileSync('data/seo/keywords.json', 'utf8')) : { seeds: {} };
const seeds = JSON.parse(fs.readFileSync('data/seo/seeds.json', 'utf8'));
const strip = h => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').toLowerCase();
const gaps = [];
for (const [page, ss] of Object.entries(seeds)) {
  if (!fs.existsSync(page)) continue;
  const text = strip(fs.readFileSync(page, 'utf8'));
  for (const s of ss) for (const phrase of kw.seeds[s]?.suggestions || []) {
    const rest = phrase.toLowerCase().replace(s.toLowerCase(), '').trim();
    if (rest && !text.includes(rest)) gaps.push({ page, seed: s, phrase, missing: rest, isNew: (kw.seeds[s].newSinceLast || []).includes(phrase) });
  }
}
// 4. experiment log: record baseline per page; GSC metrics are attached by gsc.mjs when credentials exist
const logPath = 'data/seo/experiments.json';
const log = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf8')) : [];
log.push({ date: today, avgScore: avg, pages: audit.length, lowest: audit.slice().sort((a, b) => a.score - b.score).slice(0, 5).map(p => `${p.page}:${p.score}`), keywordGaps: gaps.length });
fs.writeFileSync(logPath, JSON.stringify(log.slice(-104), null, 1));
// 4b. index tracking (from inspect.mjs): not-indexed pages feed the report and the IndexNow/priority list
const idxPath='data/seo/index-status.json';
const idx=fs.existsSync(idxPath)?JSON.parse(fs.readFileSync(idxPath,'utf8')):{};
const notIndexed=Object.entries(idx).filter(([,v])=>v.verdict!=='PASS').map(([u,v])=>`- ${u}: ${v.coverage}`);
log[log.length-1].indexed=Object.values(idx).filter(v=>v.verdict==='PASS').length; log[log.length-1].tracked=Object.keys(idx).length;
fs.writeFileSync(logPath, JSON.stringify(log.slice(-104), null, 1));
// 5. report
const med = audit.flatMap(p => p.issues.filter(i => i[0] !== 'low').map(i => `- ${p.page}: ${i[1]}`));
const md = [`# SEO growth report ${today}`, `Pages ${audit.length}, avg score ${avg}`, '', '## Auto-applied (idempotent)', ...fixLog.map(s => '- ' + s), '',
  '## Content proposals (review, then add to meta-map.json / page copy)', ...(gaps.length ? gaps.slice(0, 60).map(g => `- ${g.page} <- "${g.phrase}" (missing term: ${g.missing})${g.isNew ? ' NEW' : ''}`) : ['- none (or keywords.json empty)']), '',
  '## Google index status (' + log[log.length-1].indexed + '/' + log[log.length-1].tracked + ' indexed)', ...(notIndexed.length ? notIndexed.slice(0,80) : ['- no data yet (needs GSC credentials)']), '', '## Open audit issues (med/high)', ...(med.length ? med : ['- none'])].join('\n');
fs.writeFileSync(`reports/seo/${today}.md`, md + '\n');
console.log(md.split('\n').slice(0, 12).join('\n'));
