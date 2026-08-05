// generate-regulatory-radar.js
//
// Watches one or more government ministries' official press-release RSS
// feeds and keeps only items matching a generalized set of "something new
// just happened" keywords (new certifications, pilot programs, revised
// notices, support-program announcements, etc.) — industry-agnostic by
// design. This is the pattern that has already caught real, previously
// un-curated announcements once (see run history), so it's being scaled
// across more sources rather than kept to a single ministry or industry.
//
// No API key needed — this is a public RSS feed. No npm install needed
// (Node 18+ built-in fetch, and a small hand-rolled XML item extractor so we
// don't need an external XML parsing library).

const fs = require('fs');
const path = require('path');

// Multiple ministries' RSS feeds, each tagged with a source label.
// ⚠️ Only the MFDS entry has been confirmed live (it caught real matches on
// the first run). The others are documented as having an RSS service but
// their exact feed URLs weren't verified by fetching them directly — test
// each one manually (Actions tab → Run workflow → check the log for
// "fetched N items" per source) before trusting it long-term. If a URL is
// wrong, that one source will just return 0 items — it won't break the rest.
const SOURCES = [
  { label: 'MFDS(식약처)', url: 'http://www.mfds.go.kr/www/rss/brd.do?brdId=ntc0021' },
  // { label: 'MOTIE(산업통상자원부)', url: 'PASTE_VERIFIED_RSS_URL_HERE' },
  // { label: 'KIPO(지식재산처)', url: 'PASTE_VERIFIED_RSS_URL_HERE' },
  // { label: 'MSS(중소벤처기업부)', url: 'PASTE_VERIFIED_RSS_URL_HERE' },
];

// Generalized keywords — no longer tied to any single industry. This list is
// the entire "editorial judgment" of the whole pipeline; add/remove freely.
const KEYWORDS = [
  '신규 인증', '인증제도', '시범사업', '시범운영', '제도 개선', '고시 제정',
  '고시 개정', '지원사업 공고', '표준 제정', 'AI 활용', '신설',
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

async function fetchAllFeeds() {
  const all = [];
  for (const source of SOURCES) {
    try {
      const res = await fetch(source.url);
      if (!res.ok) {
        console.log(`[${source.label}] fetch failed: ${res.status}`);
        continue;
      }
      const xml = await res.text();
      const items = extractItems(xml).map((it) => ({ ...it, source: source.label }));
      console.log(`[${source.label}] fetched ${items.length} items.`);
      all.push(...items);
    } catch (e) {
      console.log(`[${source.label}] error: ${e.message}`);
    }
  }
  return all;
}

function renderPage(dateStr, matches) {
  const rows = matches
    .map(
      (m) => `<div class="row">
        <div class="title"><a href="${m.link}" target="_blank" rel="noopener">${m.title}</a></div>
        <div class="meta">${m.source || '—'} · ${m.pubDate || '—'}</div>
      </div>`
    )
    .join('\n      ');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>신규 제도·발표 레이더 — ${dateStr} | CBM LAB</title>
<meta name="description" content="여러 정부 부처 보도자료 중 신규 제도/인증/지원사업 관련 발표만 자동으로 걸러낸 기록 — ${dateStr}">
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
<header><a href="../data-radar-hub.html">CBM LAB</a></header>
<div class="wrap">
  <h1>신규 제도·발표 레이더 — ${dateStr}</h1>
  <div class="sub">자동 수집 · 출처: 정부 부처 보도자료 RSS (복수 소스) · <a href="index.html">← 전체 기록</a></div>
  ${matches.length ? rows : '<div class="empty">이 날짜에는 일치하는 발표가 없었습니다.</div>'}
</div>
<footer>CBM LAB — <a href="index.html">Regulatory Radar Archive</a> · <a href="../data-radar-hub.html">All Radars</a></footer>
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
  <h1>신규 제도·발표 레이더 — 전체 기록</h1>
  <p><a href="../data-radar-hub.html">← 전체 레이더 보기</a></p>
  <p>${dates.length}일치 자동 수집됨. 아직 아무도 정리하지 않은 신규 발표를 여기서 가장 먼저 확인할 수 있습니다.</p>
  <ul>
        ${items}
  </ul>
</body>
</html>`;
}

async function main() {
  if (!fs.existsSync(RADAR_DIR)) fs.mkdirSync(RADAR_DIR, { recursive: true });

  const todayStr = fmtDate(new Date());
  const items = await fetchAllFeeds();
  console.log(`Fetched ${items.length} total RSS items across all sources.`);
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
