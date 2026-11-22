// Collects Google autocomplete suggestions for seeds in data/seo/seeds.json -> data/seo/keywords.json
// Needs outbound access to suggestqueries.google.com (GitHub Actions has it). Usage: node scripts/seo/keywords.mjs
import fs from 'fs';
const seeds = JSON.parse(fs.readFileSync('data/seo/seeds.json', 'utf8'));
const out = fs.existsSync('data/seo/keywords.json') ? JSON.parse(fs.readFileSync('data/seo/keywords.json', 'utf8')) : { updated: null, seeds: {} };
const uniq = [...new Set(Object.values(seeds).flat())];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hl = s => /[가-힣]/.test(s) ? 'ko' : 'en';
let fails = 0;
for (const seed of uniq) {
  try {
    const r = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&hl=${hl(seed)}&q=${encodeURIComponent(seed + ' ')}`);
    const j = await r.json();
    const list = (j[1] || []).map(s => s.trim()).filter(Boolean);
    const prev = out.seeds[seed]?.suggestions || [];
    out.seeds[seed] = { suggestions: list, newSinceLast: list.filter(x => !prev.includes(x)), checked: new Date().toISOString().slice(0, 10) };
  } catch (e) { fails++; console.error('fail', seed, e.message); }
  await sleep(800);
}
out.updated = new Date().toISOString().slice(0, 10);
fs.writeFileSync('data/seo/keywords.json', JSON.stringify(out, null, 1));
console.log(`seeds ${uniq.length}, failed ${fails}`);
if (fails === uniq.length) process.exit(1);
