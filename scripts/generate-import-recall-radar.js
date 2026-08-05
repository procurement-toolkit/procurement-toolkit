// generate-import-recall-radar.js
//
// Pulls the last 48h of US CPSC (Consumer Product Safety Commission) recalls
// via the official saferproducts.gov REST API and generates a daily,
// bilingual-labeled digest — framed for Korean IMPORTERS/buyers checking
// whether anything they're sourcing overlaps with a recent US recall, not
// for Korean exporters. Category-agnostic: every CPSC recall category is
// included, not filtered to one industry.
//
// ⚠️ NOT LIVE-VERIFIED THIS SESSION — search tooling was unavailable when
// this was written. The saferproducts.gov REST API is a long-established,
// well-documented public API (no key required), but if the first real run
// errors out or the field names don't match, check the Action log — it
// prints a sample of the raw response, which will show what needs
// adjusting. This is the same "first-run integration" caveat as the earlier
// 나라장터 tender radar, which needed no changes on its first real run — but
// don't assume that outcome here without checking.
//
// Requires Node 18+ (built-in fetch). No npm install needed.

const fs = require('fs');
const path = require('path');

const API_URL = 'https://www.saferproducts.gov/RestWebServices/Recall';

const RADAR_DIR = path.join(__dirname, '..', 'import-recall-radar');

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}
function fmtApiDate(d) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD, what the API expects
}

async function fetchRecalls() {
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    RecallDateStart: fmtApiDate(twoDaysAgo),
    RecallDateEnd: fmtApiDate(now),
    format: 'json',
  });

  const res = await fetch(`${API_URL}?${params.toString()}`);
  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error('Response was not valid JSON. Raw response below:');
    console.error(text.slice(0, 2000));
    throw new Error('Failed to parse CPSC API response as JSON.');
  }

  console.log('Sample of raw response structure:', JSON.stringify(data).slice(0, 800));
  return Array.isArray(data) ? data : [];
}

function renderPage(dateStr, recalls) {
  const rows = recalls
    .map((r) => {
      const title = r.Title || '(no title)';
      const desc = (r.Description || '').slice(0, 240);
      const category =
        (r.Products && r.Products[0] && r.Products[0].CategoryName) || '—';
      const hazard =
        (r.Hazards && r.Hazards[0] && r.Hazards[0].Name) || '—';
      const url = r.URL || 'https://www.cpsc.gov/Recalls';
      return `<div class="row">
        <div class="title"><a href="${url}" target="_blank" rel="noopener">${title}</a></div>
        <div class="meta">카테고리: ${category} · 위해요인: ${hazard} · 발표일: ${r.RecallDate || '—'}</div>
        <div class="desc">${desc}${desc.length === 240 ? '…' : ''}</div>
      </div>`;
    })
    .join('\n      ');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>미국 리콜 수입 리스크 레이더 — ${dateStr} | CBM LAB</title>
<meta name="description" content="미국 CPSC 리콜 발표 중 최근 48시간 내 항목을 자동 정리 — 수입/소싱 중인 품목과 겹치는지 확인하세요. ${dateStr}">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@600&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{--ink:#16232e;--paper:#e7e2d3;--card:#f4f1e7;--line:#b9af98;--rust:#a63d22;}
  body{background:var(--paper);color:var(--ink);font-family:'Inter',sans-serif;margin:0;padding:0;}
  header{background:var(--ink);color:var(--paper);padding:16px 24px;font-family:'Oswald',sans-serif;font-weight:600;text-transform:uppercase;}
  header a{color:var(--paper);text-decoration:none;}
  .wrap{max-width:900px;margin:0 auto;padding:32px 24px 60px;}
  h1{font-family:'Oswald',sans-serif;font-size:1.4rem;margin:0 0 6px;}
  .sub{font-family:'IBM Plex Mono',monospace;font-size:.78rem;color:#666;margin-bottom:24px;}
  .row{background:var(--card);border:1px solid var(--line);padding:14px 16px;margin-bottom:10px;}
  .title a{color:#16232e;text-decoration:none;font-weight:500;}
  .title a:hover{text-decoration:underline;}
  .meta{font-family:'IBM Plex Mono',monospace;font-size:.74rem;color:var(--rust);margin-top:6px;}
  .desc{font-size:.85rem;color:#555;margin-top:6px;}
  .empty{font-family:'IBM Plex Mono',monospace;color:#888;padding:20px 0;}
  footer{text-align:center;font-family:'IBM Plex Mono',monospace;font-size:.72rem;color:#888;padding:30px 24px;}
</style>
</head>
<body>
<header><a href="../data-radar-hub.html">CBM LAB</a></header>
<div class="wrap">
  <h1>미국 리콜 수입 리스크 레이더 — ${dateStr}</h1>
  <div class="sub">자동 수집 · 출처: 미국 CPSC(소비자제품안전위원회) 공식 리콜 API · <a href="index.html">← 전체 기록</a></div>
  <p style="font-size:.9rem;color:#555;margin-bottom:20px;">지금 수입·소싱 중인 품목이 아래 목록과 카테고리·위해요인이 겹친다면, 발주 전에 한 번 더 확인해볼 가치가 있습니다.</p>
  ${recalls.length ? rows : '<div class="empty">최근 48시간 내 새 리콜이 없었습니다.</div>'}
</div>
<footer>CBM LAB — <a href="index.html">Import Recall Radar Archive</a> · <a href="../data-radar-hub.html">All Radars</a></footer>
</body>
</html>`;
}

function renderIndex(dates) {
  const items = dates
    .sort((a, b) => (a < b ? 1 : -1))
    .map((d) => `<li><a href="${d}.html">${d}</a></li>`)
    .join('\n        ');
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>Import Recall Radar Archive | CBM LAB</title>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  body{background:#e7e2d3;color:#16232e;font-family:'IBM Plex Mono',monospace;margin:0;padding:40px 24px;}
  h1{font-family:'Oswald',sans-serif;font-size:1.3rem;}
  ul{list-style:none;padding:0;max-width:600px;}
  li{border-bottom:1px dashed #b9af98;padding:8px 0;}
  a{color:#3e5c74;text-decoration:none;}
</style>
</head>
<body>
  <h1>미국 리콜 수입 리스크 레이더 — 전체 기록</h1>
  <p><a href="../data-radar-hub.html">← 전체 레이더 보기</a></p>
  <p>${dates.length}일치 자동 수집됨. 수입/소싱 중인 카테고리가 겹치는지 매일 확인할 수 있습니다.</p>
  <ul>
        ${items}
  </ul>
</body>
</html>`;
}

async function main() {
  if (!fs.existsSync(RADAR_DIR)) fs.mkdirSync(RADAR_DIR, { recursive: true });

  const todayStr = fmtDate(new Date());
  const recalls = await fetchRecalls();
  console.log(`Fetched ${recalls.length} recalls from the last 48h.`);

  fs.writeFileSync(
    path.join(RADAR_DIR, `${todayStr}.html`),
    renderPage(todayStr, recalls),
    'utf8'
  );

  const existingDates = fs
    .readdirSync(RADAR_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.html$/.test(f))
    .map((f) => f.replace('.html', ''));

  fs.writeFileSync(path.join(RADAR_DIR, 'index.html'), renderIndex(existingDates), 'utf8');
  console.log(`Done. Archive now has ${existingDates.length} days.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
