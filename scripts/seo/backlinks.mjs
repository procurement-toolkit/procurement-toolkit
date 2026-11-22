// Backlink candidate finder: public GitHub lists/repos in our topic area that accept link submissions. Output only; outreach stays manual.
// Usage: GH_TOKEN=... node scripts/seo/backlinks.mjs  -> data/seo/backlink-candidates.json (+ markdown lines)
import fs from 'fs';
const path = 'data/seo/backlink-candidates.json';
const prev = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : {};
const Q = ['awesome procurement', 'awesome supply chain', 'awesome logistics', 'awesome incoterms', 'awesome trade tools', '무역 도구 모음', '구매 담당자 자료 모음', 'awesome freight'];
const h = { accept: 'application/vnd.github+json', ...(process.env.GH_TOKEN ? { authorization: 'Bearer ' + process.env.GH_TOKEN } : {}) };
const fresh = [];
for (const q of Q) {
  const r = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(q + ' in:name,description,readme')}&sort=stars&per_page=8`, { headers: h });
  if (!r.ok) { console.log('search failed', q, r.status); continue; }
  for (const x of (await r.json()).items || []) if (x.stargazers_count >= 20 && !x.archived && !prev[x.full_name]) { prev[x.full_name] = { url: x.html_url, stars: x.stargazers_count, desc: x.description, pushed: x.pushed_at.slice(0, 10), found: new Date().toISOString().slice(0, 10) }; fresh.push(x.full_name); }
  await new Promise(r => setTimeout(r, 2500));
}
fs.writeFileSync(path, JSON.stringify(prev, null, 1));
console.log(fresh.length ? fresh.map(n => `- ${n} (${prev[n].stars}★, last push ${prev[n].pushed}) ${prev[n].url}`).join('\n') : '- no new candidates');
