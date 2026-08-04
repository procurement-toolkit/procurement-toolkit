// generate-daily-snapshot.js
// Run by GitHub Actions once a day. No human involvement after setup.
//
// What it does:
// 1. Fetches today's KRW exchange rate for a fixed list of currencies from
//    the free Frankfurter API (ECB data, no key required).
// 2. Also fetches the rate from 30 days ago, to compute a real % change.
// 3. Renders a brand-new static HTML page: rates/<YYYY-MM-DD>.html
// 4. Rebuilds rates/index.html so it always lists every snapshot ever generated.
//
// Requires Node 18+ (built-in fetch). No npm install needed.

const fs = require('fs');
const path = require('path');

const CURRENCIES = [
  { code: 'USD', en: 'US Dollar', ko: '미국 달러' },
  { code: 'EUR', en: 'Euro', ko: '유로' },
  { code: 'JPY', en: 'Japanese Yen', ko: '일본 엔' },
  { code: 'CNY', en: 'Chinese Yuan', ko: '중국 위안' },
  { code: 'GBP', en: 'British Pound', ko: '영국 파운드' },
  { code: 'THB', en: 'Thai Baht', ko: '태국 바트' },
  { code: 'PHP', en: 'Philippine Peso', ko: '필리핀 페소' },
  { code: 'AUD', en: 'Australian Dollar', ko: '호주 달러' },
];

const RATES_DIR = path.join(__dirname, '..', 'rates');

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function fetchRate(code, dateStr) {
  const url =
    dateStr === 'latest'
      ? `https://api.frankfurter.app/latest?from=${code}&to=KRW`
      : `https://api.frankfurter.app/${dateStr}?from=${code}&to=KRW`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed for ${code} (${dateStr})`);
  const data = await res.json();
  return data.rates && data.rates.KRW;
}

function pctChange(now, then) {
  if (!then) return null;
  return ((now - then) / then) * 100;
}

function deltaSpan(pct) {
  if (pct === null || isNaN(pct)) return '<span class="delta">—</span>';
  const cls = pct >= 0 ? 'up' : 'down';
  const sign = pct >= 0 ? '+' : '';
  return `<span class="delta ${cls}">${sign}${pct.toFixed(2)}%</span>`;
}

function renderPage(dateStr, cards) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Korea Sourcing Currency Snapshot — ${dateStr} | CBM Lab</title>
<meta name="description" content="KRW exchange rates and landed-cost impact for major sourcing currencies on ${dateStr}. Auto-generated, never edited by hand.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root{--ink:#16232e;--steel:#3e5c74;--paper:#e7e2d3;--card:#f4f1e7;--kraft:#a9791f;--rust:#a63d22;--cargo:#46705a;--line:#b9af98;--ink-70:rgba(22,35,46,.7);--ink-50:rgba(22,35,46,.5);font-size:16px;}
  *{box-sizing:border-box;} html,body{margin:0;padding:0;}
  body{background:var(--paper);color:var(--ink);font-family:'Inter',system-ui,sans-serif;line-height:1.55;}
  header{background:var(--ink);color:var(--paper);padding:16px 24px;font-family:'Oswald',sans-serif;font-weight:600;text-transform:uppercase;letter-spacing:.04em;font-size:1rem;}
  header a{color:var(--paper);text-decoration:none;}
  .wrap{max-width:900px;margin:0 auto;padding:36px 24px 60px;}
  h1{font-family:'Oswald',sans-serif;font-weight:600;font-size:1.6rem;margin:0 0 6px;}
  .sub{font-family:'IBM Plex Mono',monospace;font-size:.8rem;color:var(--ink-50);margin-bottom:26px;}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
  @media (max-width:640px){.grid{grid-template-columns:1fr;}}
  .card{background:var(--card);border:1px solid var(--line);}
  .card-top{padding:14px 16px;border-bottom:1px dashed var(--line);display:flex;justify-content:space-between;font-family:'Oswald',sans-serif;font-weight:600;text-transform:uppercase;font-size:.95rem;}
  .card-top .rate{font-family:'IBM Plex Mono',monospace;font-weight:400;}
  .card-body{padding:12px 16px;font-family:'IBM Plex Mono',monospace;font-size:.82rem;}
  .row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dashed var(--line);}
  .row:last-child{border-bottom:none;}
  .delta.up{color:var(--rust);} .delta.down{color:var(--cargo);}
  footer{text-align:center;font-family:'IBM Plex Mono',monospace;font-size:.72rem;color:var(--ink-50);padding:30px 24px;}
  footer a{color:var(--steel);}
</style>
</head>
<body>
<header><a href="../korea-sourcing-desk.html">CBM LAB</a></header>
<div class="wrap">
  <h1>Currency &amp; Landed Cost Snapshot — ${dateStr}</h1>
  <div class="sub">Auto-generated · source: Frankfurter.app (ECB) · <a href="index.html">← all snapshots</a></div>
  <div class="grid">
    ${cards.join('\n    ')}
  </div>
</div>
<footer>CBM LAB — Logistics &amp; Procurement Toolkit · <a href="index.html">Snapshot Archive</a></footer>
</body>
</html>`;
}

function renderIndex(dates) {
  const items = dates
    .sort((a, b) => (a < b ? 1 : -1))
    .map((d) => `<li><a href="${d}.html">${d}</a></li>`)
    .join('\n        ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Currency Snapshot Archive | CBM Lab</title>
<meta name="description" content="Daily archive of Korea sourcing currency and landed-cost snapshots, auto-generated every day.">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{--ink:#16232e;--paper:#e7e2d3;--line:#b9af98;--steel:#3e5c74;}
  body{background:var(--paper);color:var(--ink);font-family:'IBM Plex Mono',monospace;margin:0;padding:40px 24px;}
  h1{font-family:'Oswald',sans-serif;text-transform:uppercase;font-size:1.4rem;}
  ul{list-style:none;padding:0;max-width:600px;}
  li{border-bottom:1px dashed var(--line);padding:8px 0;}
  a{color:var(--steel);text-decoration:none;}
  a:hover{text-decoration:underline;}
</style>
</head>
<body>
  <h1>Snapshot Archive</h1>
  <p>${dates.length} snapshots, auto-generated daily since ${dates.sort()[0] || ''}.</p>
  <ul>
        ${items}
  </ul>
</body>
</html>`;
}

async function main() {
  if (!fs.existsSync(RATES_DIR)) fs.mkdirSync(RATES_DIR, { recursive: true });

  const todayStr = fmtDate(new Date());
  const d30 = fmtDate(daysAgo(30));
  const orderValue = 10000; // fixed USD-equivalent example order used in every snapshot

  const cards = [];
  for (const cur of CURRENCIES) {
    const now = await fetchRate(cur.code, 'latest');
    const then = await fetchRate(cur.code, d30);
    const pct = pctChange(now, then);
    const costToday = orderValue * now;
    const costThen = orderValue * (then || now);
    const delta = costToday - costThen;
    const sign = delta >= 0 ? '+' : '';
    cards.push(`<div class="card">
      <div class="card-top"><span>KRW/${cur.code}</span><span class="rate">₩${now.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
      <div class="card-body">
        <div class="row"><span>30-day change</span>${deltaSpan(pct)}</div>
        <div class="row"><span>$10,000 order, 30-day cost impact</span><span>₩${sign}${Math.abs(delta).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
      </div>
    </div>`);
  }

  const pageHtml = renderPage(todayStr, cards);
  fs.writeFileSync(path.join(RATES_DIR, `${todayStr}.html`), pageHtml, 'utf8');

  const existingDates = fs
    .readdirSync(RATES_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.html$/.test(f))
    .map((f) => f.replace('.html', ''));

  fs.writeFileSync(path.join(RATES_DIR, 'index.html'), renderIndex(existingDates), 'utf8');

  console.log(`Generated snapshot for ${todayStr}. Archive now has ${existingDates.length} pages.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
