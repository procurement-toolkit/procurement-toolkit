// generate-category-risk-signal.js
//
// This is the "combine, don't just list" engine. It doesn't call any paid
// API — it reads the last 7 days of raw data already collected by two
// other engines:
//   - regulatory-radar/*.json   (Korean government announcements)
//   - import-recall-radar/*.json (US CPSC product recalls)
// ...and cross-references them against a shared bilingual category
// dictionary to find categories that show up in BOTH signals within the
// trailing week. That overlap doesn't exist anywhere else, because nobody
// else has both raw feeds sitting next to each other.
//
// 100% free, no API key, no external dependency beyond the two source
// engines. The tradeoff vs. an AI classifier: this only catches a category
// if it's on the CATEGORY_DICTIONARY list below and the keyword actually
// appears in the text — it won't infer categories from context the way an
// LLM would. Expand the dictionary any time by adding a new entry; that's
// the only "maintenance" this engine will ever need.
//
// Requires Node 18+ (built-in fetch not even needed here). No npm install.

const fs = require('fs');
const path = require('path');

const REGU_DIR = path.join(__dirname, '..', 'regulatory-radar');
const RECALL_DIR = path.join(__dirname, '..', 'import-recall-radar');
const SIGNAL_DIR = path.join(__dirname, '..', 'category-risk-signal');

// Shared bilingual category dictionary — the entire "brain" of this engine.
// koKeywords are matched against Korean regulatory titles (substring match).
// enKeywords are matched against English recall titles/CategoryName
// (case-insensitive substring match). Add more categories/keywords freely.
const CATEGORY_DICTIONARY = [
  { category: '완구·유아용품 (Toys & Children\'s Products)', koKeywords: ['완구', '유아용품', '어린이 제품', '장난감'], enKeywords: ['toy', 'children', 'infant', 'nursery', 'crib', 'stroller'] },
  { category: '전자·가전 (Electronics & Appliances)', koKeywords: ['전자제품', '가전', '배터리', '충전기'], enKeywords: ['electronic', 'appliance', 'battery', 'charger', 'power'] },
  { category: '가구·인테리어 (Furniture & Home)', koKeywords: ['가구', '인테리어', '침대', '수납'], enKeywords: ['furniture', 'dresser', 'shelf', 'bed', 'cabinet'] },
  { category: '화장품·개인위생 (Cosmetics & Personal Care)', koKeywords: ['화장품', '위생용품', '세정제'], enKeywords: ['cosmetic', 'personal care', 'cleaner', 'sanitizer'] },
  { category: '의류·섬유 (Apparel & Textiles)', koKeywords: ['의류', '섬유', '섬유제품'], enKeywords: ['apparel', 'clothing', 'textile', 'garment'] },
  { category: '식품·조리기기 (Food & Cooking Equipment)', koKeywords: ['식품기기', '조리기기', '주방', '식품용기구'], enKeywords: ['kitchen', 'cooking', 'food equipment', 'cookware'] },
  { category: '스포츠·레저용품 (Sports & Leisure)', koKeywords: ['스포츠용품', '레저용품', '운동기구'], enKeywords: ['sports', 'exercise', 'leisure', 'outdoor'] },
  { category: '자동차·모빌리티 부품 (Automotive & Mobility)', koKeywords: ['자동차부품', '모빌리티', '전동킥보드'], enKeywords: ['automotive', 'vehicle', 'scooter', 'bicycle'] },
  { category: '건축자재·공구 (Building Materials & Tools)', koKeywords: ['건축자재', '공구', '건설자재'], enKeywords: ['tool', 'building material', 'hardware', 'construction'] },
  { category: '조명·전기설비 (Lighting & Electrical)', koKeywords: ['조명', '전기설비', '전선'], enKeywords: ['lighting', 'lamp', 'electrical', 'wiring'] },
];

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function readJsonSafely(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return null;
  }
}

function collectTrailingWeek(dir, filenameKey) {
  const items = [];
  for (let i = 0; i < 7; i++) {
    const dateStr = fmtDate(daysAgo(i));
    const filePath = path.join(dir, `${dateStr}.json`);
    const data = readJsonSafely(filePath);
    if (data && Array.isArray(data[filenameKey])) {
      for (const it of data[filenameKey]) items.push({ ...it, sourceDate: dateStr });
    }
  }
  return items;
}

function classifyLocally(reguItems, recallItems) {
  const signals = [];

  for (const entry of CATEGORY_DICTIONARY) {
    const matchedRegu = reguItems.filter((it) =>
      entry.koKeywords.some((kw) => (it.title || '').includes(kw))
    );
    const matchedRecall = recallItems.filter((it) => {
      const text = `${it.Title || it.title || ''} ${(it.Products && it.Products[0] && it.Products[0].CategoryName) || ''}`.toLowerCase();
      return entry.enKeywords.some((kw) => text.includes(kw.toLowerCase()));
    });

    if (matchedRegu.length === 0 && matchedRecall.length === 0) continue;

    signals.push({
      category: entry.category,
      light: matchedRegu.length > 0 && matchedRecall.length > 0 ? 'red' : 'yellow',
      reguMatches: matchedRegu,
      recallMatches: matchedRecall,
    });
  }

  // Red (real cross-signal) first, then yellow.
  signals.sort((a, b) => (a.light === b.light ? 0 : a.light === 'red' ? -1 : 1));
  return signals;
}

function renderPage(dateStr, signals) {
  const lightColor = { red: '#DC2626', yellow: '#F59E0B' };
  const lightLabel = { red: '🔴 CROSS-SIGNAL', yellow: '🟡 SINGLE SIGNAL' };

  const rows = signals
    .map((s) => {
      const reguLinks = s.reguMatches
        .map((it) => `<li><a href="../regulatory-radar/${it.sourceDate}.html" target="_blank">${it.title}</a></li>`)
        .join('');
      const recallLinks = s.recallMatches
        .map((it) => `<li><a href="../import-recall-radar/${it.sourceDate}.html" target="_blank">${it.Title || it.title}</a></li>`)
        .join('');
      return `<div class="signal-card">
        <div class="signal-top">
          <span class="light" style="color:${lightColor[s.light]}">${lightLabel[s.light]}</span>
          <h3>${s.category}</h3>
        </div>
        ${reguLinks ? `<div class="src"><b>한국 규제 발표:</b><ul>${reguLinks}</ul></div>` : ''}
        ${recallLinks ? `<div class="src"><b>US CPSC 리콜:</b><ul>${recallLinks}</ul></div>` : ''}
      </div>`;
    })
    .join('\n      ');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>카테고리 리스크 신호등 — ${dateStr} | CBM LAB</title>
<meta name="description" content="한국 규제 발표와 미국 CPSC 리콜을 교차 대조해, 최근 7일간 양쪽에서 동시에 움직인 카테고리를 자동으로 찾아냅니다 — ${dateStr}">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{--ink:#0B1424;--paper:#F6F7F9;--card:#FFFFFF;--line:#E4E7EC;--muted:#5B6472;}
  body{background:var(--paper);color:var(--ink);font-family:'Pretendard','Apple SD Gothic Neo',system-ui,sans-serif;margin:0;padding:0;}
  header{background:var(--ink);color:#fff;padding:16px 24px;font-family:'Space Grotesk',sans-serif;font-weight:700;}
  header a{color:#fff;text-decoration:none;}
  .wrap{max-width:900px;margin:0 auto;padding:32px 24px 60px;}
  h1{font-family:'Space Grotesk',sans-serif;font-size:1.4rem;margin:0 0 6px;}
  .sub{font-family:'IBM Plex Mono',monospace;font-size:.78rem;color:var(--muted);margin-bottom:8px;}
  .method{font-size:.86rem;color:var(--muted);margin-bottom:24px;max-width:70ch;}
  .signal-card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin-bottom:14px;}
  .signal-top{display:flex;align-items:center;gap:12px;margin-bottom:6px;}
  .light{font-family:'IBM Plex Mono',monospace;font-size:.72rem;font-weight:600;letter-spacing:.04em;}
  .signal-card h3{font-family:'Space Grotesk',sans-serif;font-size:1.05rem;margin:0;}
  .src{font-size:.82rem;margin-top:8px;}
  .src ul{margin:4px 0 0;padding-left:18px;}
  .src a{color:#155EEF;text-decoration:none;}
  .src a:hover{text-decoration:underline;}
  .empty{font-family:'IBM Plex Mono',monospace;color:#888;padding:20px 0;}
  footer{text-align:center;font-family:'IBM Plex Mono',monospace;font-size:.72rem;color:var(--muted);padding:30px 24px;}
  footer a{color:#155EEF;}
</style>
</head>
<body>
<header><a href="../data-radar-hub.html">CBM LAB</a></header>
<div class="wrap">
  <h1>카테고리 리스크 신호등 — ${dateStr}</h1>
  <div class="sub">자동 생성 · 최근 7일 · 출처: 규제 레이더 + 미국 리콜 레이더 키워드 교차 매칭</div>
  <p class="method">고정된 카테고리 사전을 기준으로, 최근 7일간 한국 규제 발표와 미국 CPSC 리콜 제목에 같은 카테고리 키워드가 동시에 등장했는지 대조합니다. 🔴는 두 쪽 다 걸린 진짜 교차 신호, 🟡는 한쪽에서만 포착된 신호입니다. AI 호출 없이 키워드 매칭만으로 작동해 비용이 전혀 들지 않습니다.</p>
  ${signals.length ? rows : '<div class="empty">이번 주 교차 신호가 없었습니다 (원본 레이더에 데이터가 부족하거나, 카테고리 사전에 걸리는 키워드가 없었습니다).</div>'}
</div>
<footer>CBM LAB — <a href="index.html">Signal Archive</a> · <a href="../data-radar-hub.html">All Radars</a></footer>
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
<title>Category Risk Signal Archive | CBM LAB</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  body{background:#F6F7F9;color:#0B1424;font-family:'IBM Plex Mono',monospace;margin:0;padding:40px 24px;}
  h1{font-family:'Space Grotesk',sans-serif;font-size:1.3rem;}
  ul{list-style:none;padding:0;max-width:600px;}
  li{border-bottom:1px dashed #E4E7EC;padding:8px 0;}
  a{color:#155EEF;text-decoration:none;}
</style>
</head>
<body>
  <h1>카테고리 리스크 신호등 — 전체 기록</h1>
  <p><a href="../data-radar-hub.html">← 전체 레이더 보기</a></p>
  <p>${dates.length}일치 자동 생성됨.</p>
  <ul>
        ${items}
  </ul>
</body>
</html>`;
}

async function main() {
  if (!fs.existsSync(SIGNAL_DIR)) fs.mkdirSync(SIGNAL_DIR, { recursive: true });

  const todayStr = fmtDate(new Date());
  const reguItems = collectTrailingWeek(REGU_DIR, 'matches');
  const recallItems = collectTrailingWeek(RECALL_DIR, 'recalls');
  console.log(`Trailing 7 days: ${reguItems.length} regulatory items, ${recallItems.length} recall items.`);

  const signals = classifyLocally(reguItems, recallItems);
  console.log(`Found ${signals.length} category signals (no API call made).`);

  fs.writeFileSync(
    path.join(SIGNAL_DIR, `${todayStr}.html`),
    renderPage(todayStr, signals),
    'utf8'
  );

  const existingDates = fs
    .readdirSync(SIGNAL_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.html$/.test(f))
    .map((f) => f.replace('.html', ''));

  fs.writeFileSync(path.join(SIGNAL_DIR, 'index.html'), renderIndex(existingDates), 'utf8');
  console.log(`Done. Archive now has ${existingDates.length} days.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

