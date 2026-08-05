// generate-tender-radar.js
//
// Pulls the last 24h of Korean government procurement bid announcements from
// the official 조달청(PPS) open API (data.go.kr) and keeps only the ones whose
// title matches kitchen/food-equipment keywords. Writes one new page per day.
//
// ⚠️ NOT YET TESTED WITH A REAL KEY — I (Claude) don't have a data.go.kr
// account, so I couldn't execute this against the live API. The request
// shape and parameter names follow the official documentation, but if the
// first real run in GitHub Actions errors out or returns unexpected fields,
// check the Action log — the raw API response will be printed there, and
// the field names may need small adjustments (this is normal for a
// first-run integration with a government API).
//
// Setup required (see README-tender-radar.md):
// 1. Register at data.go.kr, request access to "조달청_나라장터 입찰공고정보서비스"
// 2. Add the issued key as a GitHub repo secret named DATA_GO_KR_KEY
//
// Requires Node 18+ (built-in fetch). No npm install needed.

const fs = require('fs');
const path = require('path');

const SERVICE_KEY = process.env.DATA_GO_KR_KEY;
const BASE_URL =
  'https://apis.data.go.kr/1230000/ao/PubDataOpnStdService/getDataSetOpnStdBidPblancInfo';

// Keywords checked against the bid title (bidNtceNm). Add/remove freely —
// this list is the entire "editorial judgment" of the whole pipeline.
const KEYWORDS = [
  '주방기기', '조리기기', '급식기기', '인덕션', '취반기',
  '식기세척기', '급식설비', '조리설비', '단체급식', '주방설비',
];

const TENDERS_DIR = path.join(__dirname, '..', 'tenders');

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}
function fmtDateTime(d) {
  // YYYYMMDDHHMM as required by the API
  return (
    d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0') +
    String(d.getHours()).padStart(2, '0') +
    String(d.getMinutes()).padStart(2, '0')
  );
}

async function fetchBids() {
  if (!SERVICE_KEY) {
    throw new Error(
      'DATA_GO_KR_KEY is not set. Add it as a GitHub Actions secret before running.'
    );
  }
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    ServiceKey: SERVICE_KEY,
    numOfRows: '500',
    pageNo: '1',
    type: 'json',
    bidNtceBgnDt: fmtDateTime(yesterday),
    bidNtceEndDt: fmtDateTime(now),
  });

  const res = await fetch(`${BASE_URL}?${params.toString()}`);
  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error('Response was not valid JSON. Raw response below:');
    console.error(text.slice(0, 2000));
    throw new Error('Failed to parse API response as JSON.');
  }

  // Log the raw shape once so a human can adjust field names quickly if needed.
  console.log('Sample of raw response structure:', JSON.stringify(data).slice(0, 800));

  const items =
    data?.response?.body?.items?.item ||
    data?.response?.body?.items ||
    [];
  return Array.isArray(items) ? items : [items].filter(Boolean);
}

function matchesKeyword(title) {
  if (!title) return false;
  return KEYWORDS.some((kw) => title.includes(kw));
}

function renderPage(dateStr, matches) {
  const rows = matches
    .map(
      (m) => `<div class="row">
        <div class="title">${m.bidNtceNm || '(제목 없음)'}</div>
        <div class="meta">
          <span>발주기관: ${m.ntceInsttNm || m.dminsttNm || '—'}</span>
          <span>마감: ${m.bidClseDt || '—'}</span>
          <span>추정가격: ${m.presmptPrce ? Number(m.presmptPrce).toLocaleString() + '원' : '—'}</span>
        </div>
      </div>`
    )
    .join('\n      ');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>주방·조리기기 공공입찰 레이더 — ${dateStr} | CBM LAB</title>
<meta name="description" content="한국 정부 공공조달 입찰 중 주방·조리·급식기기 관련 공고만 자동으로 걸러낸 일일 기록 — ${dateStr}">
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
  .title{font-weight:500;margin-bottom:6px;}
  .meta{display:flex;gap:16px;flex-wrap:wrap;font-family:'IBM Plex Mono',monospace;font-size:.78rem;color:#555;}
  .empty{font-family:'IBM Plex Mono',monospace;color:#888;padding:20px 0;}
  footer{text-align:center;font-family:'IBM Plex Mono',monospace;font-size:.72rem;color:#888;padding:30px 24px;}
</style>
</head>
<body>
<header><a href="../data-radar-hub.html">CBM LAB</a></header>
<div class="wrap">
  <h1>주방·조리기기 공공입찰 레이더 — ${dateStr}</h1>
  <div class="sub">자동 수집 · 출처: 조달청 나라장터 openAPI (data.go.kr) · <a href="index.html">← 전체 기록</a></div>
  ${matches.length ? rows : '<div class="empty">이 날짜에는 일치하는 공고가 없었습니다.</div>'}
</div>
<footer>CBM LAB — <a href="index.html">Tender Radar Archive</a> · <a href="../data-radar-hub.html">All Radars</a></footer>
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
<title>Tender Radar Archive | CBM LAB</title>
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
  <h1>주방·조리기기 공공입찰 레이더 — 전체 기록</h1>
  <p><a href="../data-radar-hub.html">← 전체 레이더 보기</a></p>
  <p>${dates.length}일치 자동 수집됨.</p>
  <ul>
        ${items}
  </ul>
</body>
</html>`;
}

async function main() {
  if (!fs.existsSync(TENDERS_DIR)) fs.mkdirSync(TENDERS_DIR, { recursive: true });

  const todayStr = fmtDate(new Date());
  const items = await fetchBids();
  const matches = items.filter((it) => matchesKeyword(it.bidNtceNm));

  console.log(`Fetched ${items.length} total bids, ${matches.length} matched keywords.`);

  fs.writeFileSync(
    path.join(TENDERS_DIR, `${todayStr}.html`),
    renderPage(todayStr, matches),
    'utf8'
  );

  const existingDates = fs
    .readdirSync(TENDERS_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.html$/.test(f))
    .map((f) => f.replace('.html', ''));

  fs.writeFileSync(path.join(TENDERS_DIR, 'index.html'), renderIndex(existingDates), 'utf8');
  console.log(`Done. Archive now has ${existingDates.length} days.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
