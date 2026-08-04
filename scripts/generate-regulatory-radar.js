// generate-regulatory-radar.js
//
// Watches the Ministry of Food and Drug Safety's official press-release RSS
// feed (confirmed live URL as of 2026-08) and keeps only items matching
// food-equipment / certification keywords. This is exactly the kind of feed
// that would have surfaced the K-NSF launch announcement the day it happened.
//
// No API key needed — this is a public RSS feed. No npm install needed
// (Node 18+ built-in fetch, and a small hand-rolled XML item extractor so we
// don't need an external XML parsing library).

const fs = require('fs');
const path = require('path');

const RSS_URL = 'http://www.mfds.go.kr/www/rss/brd.do?brdId=ntc0021'; // MFDS 보도자료

const KEYWORDS = [
  '인증', 'NSF', 'K-NSF', '식품기기', '조리기기', '주방', '위생',
  '안전관리인증', 'HACCP', '급식', '식품용기구',
];

const RADAR_DIR = path.join(__dirname, '..', 'regulatory-radar');

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function stripTags(s) {
  return (s || '').replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim();
}

function extractItems(xml) {
  const items = [];
  const itemBlocks = xml.split('<item>').slice(1);
  for (const block of itemBlocks) {
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
    const dateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    items.push({
      title: stripTags(titleMatch ? titleMatch[1] : ''),
      link: stripTags(linkMatch ? linkMatch[1] : ''),
      pubDate: stripTags(dateMatch ? dateMatch[1] : ''),
    });
  }
  return items;
}

function matchesKeyword(title) {
  if (!title) return false;
  return KEYWORDS.some((kw) => title.includes(kw));
}

async function fetchFeed() {
  const res = await fetch(RSS_URL);
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);
  const xml = await res.text();
  return extractItems(xml);
}

function renderPage(dateStr, matches) {
  const rows = matches
    .map(
      (m) => `<div class="row">
        <div class="title"><a href="${m.link}" target="_blank" rel="noopener">${m.title}</a></div>
        <div class="meta">${m.pubDate || '—'}</div>
      </div>`
    )
    .join('\n      ');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>식품·주방기기 규제 레이더 — ${dateStr} | CBM LAB</title>
<meta name="description" content="식약처 보도자료 중 인증·규제 관련 신규 발표만 자동으로 걸러낸 기록 — ${dateStr}">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@600&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{--ink:#16232e;--paper:#e7e2d3;--card:#f4f1e7;--line:#b9af98;}
  body{background:var(--paper);color:var(--ink);font-family:'Inter',sans-serif;margin:0;padding:0;}
  header{background:var(--ink);color:var(--paper);padding:16px 24px;font-family:'Oswald',sans-serif;font-weight:600;text-transform:uppercase;}
  header a{color:var(--paper);text-decoration:none;}
  .wrap{max-width:900px;margin:0 auto;padding:32px 24px 60px;}
  h1{font-family:'Oswald',sans-serif;font-size:1.4rem;margin:0 0 6px;}
  .sub{font-family:'IBM Plex Mono',monospace;font-size:.78rem;color:#666;margin-bottom:24px;}
  .row{background:var(--card);border:1px solid var(--line);padding:14px 16px;margin-bottom:10px;}
  .title a{color:#16232e;text-decoration:none;font-weight:500;}
  .title a:hover{text-decoration:underline;}
  .meta{font-family:'IBM Plex Mono',monospace;font-size:.76rem;color:#666;margin-top:6px;}
  .empty{font-family:'IBM Plex Mono',monospace;color:#888;padding:20px 0;}
  footer{text-align:center;font-family:'IBM Plex Mono',monospace;font-size:.72rem;color:#888;padding:30px 24px;}
</style>
</head>
<body>
<header><a href="../korea-sourcing-desk.html">CBM LAB</a></header>
<div class="wrap">
  <h1>식품·주방기기 규제 레이더 — ${dateStr}</h1>
  <div class="sub">자동 수집 · 출처: 식품의약품안전처 보도자료 RSS · <a href="index.html">← 전체 기록</a></div>
  ${matches.length ? rows : '<div class="empty">이 날짜에는 일치하는 발표가 없었습니다.</div>'}
</div>
<footer>CBM LAB — <a href="index.html">Regulatory Radar Archive</a></footer>
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
<title>Regulatory Radar Archive | CBM LAB</title>
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
  <h1>식품·주방기기 규제 레이더 — 전체 기록</h1>
  <p>${dates.length}일치 자동 수집됨. 다음 K-NSF급 발견은 여기서 나올 수 있습니다.</p>
  <ul>
        ${items}
  </ul>
</body>
</html>`;
}

async function main() {
  if (!fs.existsSync(RADAR_DIR)) fs.mkdirSync(RADAR_DIR, { recursive: true });

  const todayStr = fmtDate(new Date());
  const items = await fetchFeed();
  console.log(`Fetched ${items.length} RSS items.`);
  const matches = items.filter((it) => matchesKeyword(it.title));
  console.log(`${matches.length} matched keywords.`);

  fs.writeFileSync(
    path.join(RADAR_DIR, `${todayStr}.html`),
    renderPage(todayStr, matches),
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
