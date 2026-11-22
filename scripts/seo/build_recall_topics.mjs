// Builds evergreen pages from the accumulated daily CPSC recall JSON: hub + by-country + by-hazard.
// Source: US CPSC recall API (saferproducts.gov). Idempotent; rewrites recalls/*.html. Usage: node scripts/seo/build_recall_topics.mjs
import fs from 'fs';
const BASE = 'https://procurement-toolkit-eight.vercel.app';
const SRC = 'import-recall-radar', OUT = 'recalls';
const CN = { China: '중국', Vietnam: '베트남', Mexico: '멕시코', Taiwan: '대만', Thailand: '태국', India: '인도', Indonesia: '인도네시아', Malaysia: '말레이시아', Canada: '캐나다', Italy: '이탈리아', 'United States': '미국', 'United Kingdom': '영국', Germany: '독일', Japan: '일본', 'South Korea': '한국', Korea: '한국', Turkey: '튀르키예', France: '프랑스', Singapore: '싱가포르' };
const SLUG = { China: 'china', Vietnam: 'vietnam', Mexico: 'mexico', Taiwan: 'taiwan', Thailand: 'thailand', India: 'india', 'United States': 'united-states' };
const normC = c => ({ USA: 'United States', 'United State': 'United States', England: 'United Kingdom' }[c] || c);
const HAZ = [ // [slug, 한글, regex over English hazard text]
  ['fire-burn', '화재·과열·화상', /fire|burn|overheat|ignit|flam/i],
  ['battery', '배터리·충전', /batter|lithium|charger/i],
  ['ingestion-choking', '삼킴·질식', /ingest|swallow|chok|asphyx|suffocat|strangul/i],
  ['fall-tipover', '추락·전도·낙상', /tip.?over|\bfalls?\b|\bfalling\b|entrap/i],
  ['laceration-impact', '베임·충격·부상', /laceration|\bcuts?\b|sharp|amputat|crash|collision/i],
  ['shock', '감전', /shock|electrocut/i],
  ['chemical-lead', '납·화학물질', /\blead\b(?!\s+to)|chemical(?!\s+burn)|toxic|phthalate|mercury|cadmium/i],
];
const rec = new Map();
for (const f of fs.readdirSync(SRC).filter(x => x.endsWith('.json')))
  for (const r of JSON.parse(fs.readFileSync(`${SRC}/${f}`, 'utf8')).recalls || []) rec.set(r.RecallID, r);
const all = [...rec.values()].map(r => ({
  id: r.RecallID, title: (r.Title || '').trim(), date: (r.RecallDate || '').slice(0, 10), url: r.URL || 'https://www.cpsc.gov/Recalls',
  countries: [...new Set((r.ManufacturerCountries || []).map(x => normC(x.Country)).filter(Boolean))],
  units: (r.Products || []).map(p => p.NumberOfUnits).find(Boolean) || '',
  hazText: (r.Hazards || []).map(h => h.Name).join(' ') + ' ' + (r.Title || ''),
})).filter(r => r.title && r.date).sort((a, b) => b.date.localeCompare(a.date));
for (const r of all) r.haz = HAZ.filter(h => h[2].test(r.hazText)).map(h => h[0]);
const today = new Date().toISOString().slice(0, 10);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const first = all.at(-1)?.date, last = all[0]?.date;
const css = `:root{--ink:#16232e;--paper:#e7e2d3;--card:#f4f1e7;--line:#b9af98;--rust:#a63d22}body{background:var(--paper);color:var(--ink);font-family:Inter,system-ui,sans-serif;margin:0;line-height:1.65}header{background:var(--ink);padding:16px 24px}header a{color:var(--paper);text-decoration:none;font-weight:600}.wrap{max-width:860px;margin:0 auto;padding:28px 20px 56px}h1{font-size:1.45rem;margin:0 0 8px}h2{font-size:1.05rem;margin:28px 0 10px}.sub{font-size:.82rem;color:#555}.row{background:var(--card);border:1px solid var(--line);padding:12px 14px;margin-bottom:8px}.row a{color:var(--ink);font-weight:500}.meta{font-size:.76rem;color:var(--rust);margin-top:4px}table{border-collapse:collapse;width:100%;font-size:.88rem}td,th{border-bottom:1px solid var(--line);padding:7px 6px;text-align:left}a{color:#3e5c74}footer{font-size:.78rem;color:#666;text-align:center;padding:24px}.note{font-size:.82rem;color:#555}.row,td,th,p,h1{overflow-wrap:anywhere}`;
const hazK = Object.fromEntries(HAZ.map(h => [h[0], h[1]]));
function page({ file, title, desc, h1, intro, body, items }) {
  const url = `${BASE}/recalls/${file}`;
  const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description: desc, url, inLanguage: 'ko', dateModified: today, isPartOf: { '@type': 'WebSite', name: 'CBM Lab', url: BASE + '/' }, mainEntity: { '@type': 'ItemList', numberOfItems: items.length, itemListElement: items.slice(0, 20).map((r, i) => ({ '@type': 'ListItem', position: i + 1, name: r.title, url: r.url })) } };
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><meta property="og:type" content="website">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>${css}</style>
</head>
<body>
<header><a href="../data-radar-hub.html">CBM LAB</a></header>
<div class="wrap">
<h1>${esc(h1)}</h1>
<p class="sub">출처: 미국 소비자제품안전위원회(CPSC) 공식 리콜 API · 수집 기간 ${first}~${last} · 갱신 ${today}</p>
<p>${intro}</p>
${body}
<h2>데이터 해석 시 유의할 점</h2>
<p class="note">이 페이지의 건수는 CBM Lab이 위 기간에 수집한 CPSC 리콜 기록(중복 제거 후 ${all.length}건)만 센 값이며, CPSC 전체 통계가 아닙니다. 제조국은 CPSC가 리콜 공지에 표기한 값을 그대로 쓰며, 표기가 없는 건은 국가별 집계에서 빠집니다. 위해요인 분류는 공지문 키워드 기준의 자동 분류라 한 건이 여러 분류에 들어갈 수 있습니다. 발주·수입 판단 전에는 반드시 각 건의 <a href="https://www.cpsc.gov/Recalls" rel="noopener">CPSC 원문</a>을 확인하세요.</p>
<p class="note"><a href="./">리콜 모음 홈</a> · <a href="../data-radar-hub.html">전체 데이터 레이더</a> · <a href="../index.html">무역·구매 도구 전체</a></p>
</div>
<footer>CBM LAB</footer>
</body>
</html>`;
}
const list = items => items.map(r => `<div class="row"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a><div class="meta">${r.date}${r.countries.length ? ' · 제조국 ' + r.countries.map(c => CN[c] || c).join(', ') : ''}${r.units ? ' · ' + esc(r.units) : ''}${r.haz.length ? ' · ' + r.haz.map(h => hazK[h]).join(', ') : ''}</div></div>`).join('\n');
const HAZ_N = Object.fromEntries(HAZ.map(h => [h[0], all.filter(r => r.haz.includes(h[0])).length]));
fs.mkdirSync(OUT, { recursive: true });
const written = new Set();
const w = (file, o) => { fs.writeFileSync(`${OUT}/${file}`, page({ file, ...o })); written.add(file); };
// country pages (>=3 recalls, only slugged countries so URLs stay stable)
const byC = {}; for (const r of all) for (const c of r.countries) (byC[c] ||= []).push(r);
const cRows = Object.entries(byC).sort((a, b) => b[1].length - a[1].length);
for (const [c, items] of cRows) if (SLUG[c] && items.length >= 3) {
  const k = CN[c] || c;
  w(`${SLUG[c]}.html`, { title: `${k} 제조 제품 미국 CPSC 리콜 현황 (${items.length}건) | CBM Lab`, desc: `${k}에서 제조된 제품의 미국 CPSC 리콜 ${items.length}건을 최신순으로 정리. 위해요인 분포와 수입 전 확인 포인트.`, h1: `${k} 제조 제품 미국 리콜 현황`, intro: `${first}~${last} 사이 CPSC에 공지된 리콜 중 제조국이 ${k}로 표기된 ${items.length}건입니다. ${k}산 제품을 소싱 중이라면 같은 품목군이 목록에 있는지 먼저 확인해 보세요.`, body: `<h2>위해요인 분포</h2><table><tr><th>분류</th><th>건수</th></tr>${HAZ.map(h => [h, items.filter(r => r.haz.includes(h[0])).length]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).map(([h, n]) => (HAZ_N[h[0]] >= 5 ? `<tr><td><a href="hazard-${h[0]}.html">${h[1]}</a></td><td>${n}</td></tr>` : `<tr><td>${h[1]}</td><td>${n}</td></tr>`)).join('')}</table><h2>리콜 목록 (최신순)</h2>${list(items.slice(0, 60))}`, items });
}
for (const h of HAZ) {
  const items = all.filter(r => r.haz.includes(h[0])); if (items.length < 5) continue;
  w(`hazard-${h[0]}.html`, { title: `${h[1]} 위험 미국 CPSC 리콜 ${items.length}건 모음 | CBM Lab`, desc: `${h[1]} 사유로 공지된 미국 CPSC 리콜 ${items.length}건. 제조국 분포와 최신 사례.`, h1: `${h[1]} 사유 미국 리콜 모음`, intro: `${first}~${last} 사이 공지된 리콜 중 위해요인 설명에 ${h[1]} 관련 표현이 있는 ${items.length}건입니다.`, body: `<h2>제조국 분포</h2><table><tr><th>제조국</th><th>건수</th></tr>${Object.entries(items.flatMap(r => r.countries).reduce((m, c) => (m[c] = (m[c] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c, n]) => `<tr><td>${CN[c] || c}</td><td>${n}</td></tr>`).join('')}</table><h2>리콜 목록 (최신순)</h2>${list(items.slice(0, 60))}`, items });
}
const cLinks = cRows.filter(([c, i]) => SLUG[c] && i.length >= 3).map(([c, i]) => `<tr><td><a href="${SLUG[c]}.html">${CN[c] || c}</a></td><td>${i.length}</td></tr>`).join('');
const hLinks = HAZ.map(h => [h, all.filter(r => r.haz.includes(h[0])).length]).filter(x => x[1] >= 5).map(([h, n]) => `<tr><td><a href="hazard-${h[0]}.html">${h[1]}</a></td><td>${n}</td></tr>`).join('');
w('index.html', { title: '미국 CPSC 리콜 수입 리스크 모음 — 제조국·위해요인별 | CBM Lab', desc: `미국 CPSC 리콜 ${all.length}건을 제조국·위해요인별로 정리하고 매일 갱신합니다. 수입·소싱 담당자가 발주 전에 겹치는 품목을 확인하는 용도.`, h1: '미국 CPSC 리콜 수입 리스크 모음', intro: `${first}~${last} 사이 CPSC가 공지한 리콜 ${all.length}건을 제조국과 위해요인별로 묶었습니다. 매일 자동으로 갱신됩니다.`, body: `<h2>제조국별</h2><table><tr><th>제조국</th><th>건수</th></tr>${cLinks}</table><h2>위해요인별</h2><table><tr><th>분류</th><th>건수</th></tr>${hLinks}</table><h2>최근 리콜</h2>${list(all.slice(0, 30))}`, items: all });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.html') && !written.has(f)) fs.unlinkSync(`${OUT}/${f}`);
console.log('recall topic pages:', [...written].join(', '), '| recalls', all.length);
