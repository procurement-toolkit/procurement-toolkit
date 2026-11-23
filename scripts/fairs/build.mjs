// Builds the trade-fair directory: fairs/ (KO) and en/fairs/ (EN). Source of truth: data/fairs/fairs.txt
// Line format: name|start YYYY-MM-DD|end YYYY-MM-DD|city|description[|official URL]
// Auto-prune: fairs that ended more than PRUNE_DAYS ago are removed from the data file itself (keeps the repo small).
import fs from 'fs';
import { GROUPS, groupOf } from './taxonomy.mjs';
const BASE = 'https://procurement-toolkit-eight.vercel.app';
const PRUNE_DAYS = 60, VERIFIED = '2026-11-23';
const today = new Date().toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ICONS = JSON.parse(fs.readFileSync('scripts/bids/icons.json', 'utf8'));
const svg = n => `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="${ICONS[n] || ICONS.event}"/></svg>`;
const slugify = s => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

// ---- load + validate + prune -------------------------------------------------------------
const CITY = { // city -> [country code, KO city]
  Leipzig: ['DE', '라이프치히'], Cologne: ['DE', '쾰른'], Nuremberg: ['DE', '뉘른베르크'], Munich: ['DE', '뮌헨'], Hanover: ['DE', '하노버'], Hannover: ['DE', '하노버'],
  Dusseldorf: ['DE', '뒤셀도르프'], Frankfurt: ['DE', '프랑크푸르트'], 'Frankfurt am Main': ['DE', '프랑크푸르트'], Berlin: ['DE', '베를린'], Essen: ['DE', '에센'],
  Karlsruhe: ['DE', '카를스루에'], Dortmund: ['DE', '도르트문트'], Hamburg: ['DE', '함부르크'], 'Offenbach am Main': ['DE', '오펜바흐'], Offenburg: ['DE', '오펜부르크'],
  Stuttgart: ['DE', '슈투트가르트'], Wiesbaden: ['DE', '비스바덴'], Friedrichshafen: ['DE', '프리드리히스하펜'], Husum: ['DE', '후줌'],
  'Las Vegas': ['US', '라스베이거스'], 'Anaheim, California': ['US', '애너하임'], Barcelona: ['ES', '바르셀로나'], Singapore: ['SG', '싱가포르'], London: ['GB', '런던'],
};
const CTRY = { DE: ['독일', 'Germany'], US: ['미국', 'United States'], ES: ['스페인', 'Spain'], SG: ['싱가포르', 'Singapore'], GB: ['영국', 'United Kingdom'] };
const raw = fs.readFileSync('data/fairs/fairs.txt', 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
const keep = [], dropped = [], seen = new Set(), warn = [];
const pruneBefore = addDays(today, -PRUNE_DAYS);
for (const line of raw) {
  const [n, s, e, c, d, u] = line.split('|').map(x => x?.trim());
  const ok = n && /^\d{4}-\d{2}-\d{2}$/.test(s) && /^\d{4}-\d{2}-\d{2}$/.test(e) && c && d && !Number.isNaN(Date.parse(s)) && !Number.isNaN(Date.parse(e));
  if (!ok) { warn.push('bad line: ' + line); continue; }            // missing/"TBD" dates are never published
  if (e < s) { warn.push('end<start: ' + line); continue; }
  if (!CITY[c]) warn.push('unknown city (country unset): ' + c);
  const key = `${n.toLowerCase()}|${s}`;                              // duplicate = same name + start
  if (seen.has(key)) { warn.push('dup: ' + n); continue; }
  seen.add(key);
  if (e < pruneBefore) { dropped.push(n); continue; }
  keep.push({ n, s, e, c, d, u: u || '' });
}
keep.sort((a, b) => a.s.localeCompare(b.s) || a.n.localeCompare(b.n));
if (dropped.length) fs.writeFileSync('data/fairs/fairs.txt', keep.map(f => [f.n, f.s, f.e, f.c, f.d, f.u].filter((x, i) => i < 5 || x).join('|')).join('\n') + '\n');
for (const f of keep) {
  f.g = groupOf(f); f.cc = CITY[f.c]?.[0] || 'XX'; f.ck = CITY[f.c]?.[1] || f.c;
  const sameName = keep.filter(x => x.n === f.n).length > 1;
  f.slug = slugify(f.n) + '-' + f.s.slice(0, sameName ? 7 : 4);
  f.status = f.e < today ? 'ended' : f.s <= today ? 'ongoing' : 'upcoming';
}
const slugs = new Set(); for (const f of keep) { if (slugs.has(f.slug)) f.slug += '-' + f.s.slice(5, 7); slugs.add(f.slug); }

// ---- images (Wikimedia Commons, CC/PD only; fair-specific photo if one exists, else the venue photo, else none) ----
const IMG = ['data/fairs/images.txt', 'data/fairs/images.auto.txt'].filter(f => fs.existsSync(f)).flatMap(f => fs.readFileSync(f, 'utf8').split('\n')).filter(l => l && !l.startsWith('#')).map(l => { const [k, t, lic, a] = l.split('|'); return { k, t, lic, a }; });
for (const f of keep) {
  const own = IMG.find(i => !i.k.startsWith('venue:') && f.n.toLowerCase().includes(i.k.toLowerCase()));
  const ven = IMG.find(i => i.k === 'venue:' + f.c);
  const im = own || ven; f.img = im ? { ...im, venue: !own } : null;
}
const imgUrl = (i, w) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(i.t)}?width=${w}`;
const imgPage = i => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(i.t.replace(/ /g, '_'))}`;
// ---- text -------------------------------------------------------------------------------
const T = {
  ko: { lang: 'ko', dir: 'fairs', loc: 'ko-KR', hub: '../data-radar-hub.html', hubName: '데이터 레이더', other: 'English', tools: [['cbm.html', 'CBM 계산기'], ['landed-cost-calculator.html', '착지원가 계산기'], ['incoterms-guide.html', '인코텀즈 가이드'], ['hs-code-guide.html', 'HS코드 가이드'], ['global-holiday-calendar.html', '세계 공휴일 달력']],
    fmt: (s, e) => { const a = s.split('-'), b = e.split('-'); return s === e ? `${a[0]}.${a[1]}.${a[2]}` : a[0] === b[0] ? `${a[0]}.${a[1]}.${a[2]} – ${b[1]}.${b[2]}` : `${a[0]}.${a[1]}.${a[2]} – ${b[0]}.${b[1]}.${b[2]}`; },
    mon: '개최월', from: '시작일 이후', to: '종료일 이전', inclEnded: '종료된 전시회 포함', reset: '초기화', count: '건',
    title: '세계 전시회 일정 | 품목별 해외 무역박람회 캘린더 — CBM Lab', h1: '세계 전시회 일정', up: '예정·진행 중', ended: '최근 종료', all: '전체', byG: '품목별 전시회', byC: '국가별', search: '전시회·도시 검색', none: '조건에 맞는 전시회가 없습니다.',
    sub: '해외 소싱과 수출 상담에 쓰는 무역박람회를 품목별로 모았습니다. 기간·도시·분야를 한눈에 보고, 종료 후 60일이 지난 전시회는 자동으로 목록에서 빠집니다.',
    l1: '예정·진행 중 전시회', l2: '30일 내 개막', l3: '품목 분야', l4: '개최 국가', nUp: n => `예정·진행 중 ${n}건`, nG: n => `${n}개 품목`, nC: n => `${n}개국`, next30: n => `30일 내 개막 ${n}건`,
    gd: n => `${n} 전시회`, gdesc: (n, k) => `${n} 분야 해외 전시회 일정 ${k}건. 기간, 개최 도시, 방문 전 준비사항을 정리했습니다.`,
    cdesc: (n, k) => `${n}에서 열리는 전시회 일정 ${k}건. 품목별로 기간과 도시를 확인하세요.`,
    dates: '일정', place: '개최지', field: '분야', verify: '최종 확인일', src: '출처', ddays: d => d > 0 ? `개막 D-${d}` : d === 0 ? '오늘 개막' : '진행 중',
    srcline: '일정 출처: 미국 상무부 International Trade Administration(trade.gov)의 독일 주최 무역박람회 목록. 전시회 일정은 주최 측 사정으로 바뀔 수 있으므로 참가·출장 확정 전에는 반드시 주최 측 공식 사이트에서 다시 확인하세요.',
    detailDesc: f => `${f.n}은(는) ${f.ck}에서 ${T.ko.fmt(f.s, f.e)} 열리는 ${GROUPS.find(g => g.k === f.g).ko} 분야 전시회입니다.`,
    prepH: '방문 전 준비 체크리스트', guideH: '전시회를 소싱에 쓰는 방법',
    prep: f => [`개막 약 8주 전: 참가업체 목록을 받아 만나고 싶은 업체 5~10곳을 정하고 미팅을 요청합니다.`, `개막 약 4주 전: 항공편과 숙소를 확정합니다. 전시 기간 도시 숙박은 일찍 마감됩니다.`, `출국 전: 구매하려는 품목의 한국 수입 요건(인증·표시·통관)을 미리 확인합니다.`, `현장: 부스마다 MOQ, 견적 유효기간, 인코텀즈, 샘플 비용, 인증 보유 여부를 같은 양식으로 메모합니다.`, `귀국 후 1주 안: 감사 메일과 함께 견적·샘플 요청을 보내야 기억이 남아 있을 때 협상이 이어집니다.`],
    gdLong: [['명함보다 질문 목록', '부스에서는 시간이 길지 않습니다. MOQ, 납기, 인코텀즈, 결제 조건, 인증, 샘플 비용 여섯 가지를 같은 순서로 물어보면 업체 간 비교가 쉬워집니다.'], ['첫날보다 둘째 날', '첫날은 사람이 몰려 깊은 대화가 어렵습니다. 중간 일정에 핵심 업체를 다시 방문하면 영업 담당이 아닌 기술 담당과 이야기할 수 있는 경우가 많습니다.'], ['견적은 착지원가로 환산', '전시장에서 받은 FOB 단가는 운임·관세·부가세를 더해야 비교가 됩니다. 귀국 후 [착지원가 계산기](../landed-cost-calculator.html)로 같은 조건에 맞춰 환산해 보세요.'], ['일정은 공휴일과 함께', '전시 전후 현지 공휴일에는 업체 회신이 늦어집니다. 출장 일정은 [세계 공휴일 달력](../global-holiday-calendar.html)과 함께 보세요.']] },
  en: { lang: 'en', dir: 'en/fairs', loc: 'en-US', hub: '../../data-radar-hub.html', hubName: 'Data Radar', other: '한국어', tools: [['cbm-calculator.html', 'CBM calculator'], ['landed-cost-calculator.html', 'Landed cost calculator'], ['incoterms-guide.html', 'Incoterms guide'], ['hs-code-guide.html', 'HS code guide'], ['global-holiday-calendar.html', 'Global holiday calendar']],
    fmt: (s, e) => { const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; const a = s.split('-'), b = e.split('-'); const A = `${M[+a[1] - 1]} ${+a[2]}`, B = `${M[+b[1] - 1]} ${+b[2]}`; return s === e ? `${A}, ${a[0]}` : a[0] === b[0] ? `${A} – ${B}, ${a[0]}` : `${A}, ${a[0]} – ${B}, ${b[0]}`; },
    mon: 'Month', from: 'From', to: 'Until', inclEnded: 'Include ended fairs', reset: 'Reset', count: 'fairs',
    title: 'Trade Fair Calendar by Industry — Upcoming Trade Shows Worldwide | CBM Lab', h1: 'Trade Fair Calendar', up: 'Upcoming & ongoing', ended: 'Recently ended', all: 'All', byG: 'Trade fairs by industry', byC: 'By country', search: 'Search fair or city', none: 'No trade fairs match.',
    sub: 'Trade shows for overseas sourcing and export meetings, grouped by industry. See dates, city and sector at a glance. Fairs that ended more than 60 days ago drop off the list automatically.',
    l1: 'Upcoming & ongoing fairs', l2: 'Opening within 30 days', l3: 'Industries', l4: 'Host countries', nUp: n => `${n} upcoming or ongoing`, nG: n => `${n} industries`, nC: n => `${n} countries`, next30: n => `${n} opening within 30 days`,
    gd: n => `${n} trade fairs`, gdesc: (n, k) => `${k} upcoming ${n} trade fairs with dates, host city and a pre-visit checklist.`,
    cdesc: (n, k) => `${k} trade fairs held in ${n}, with dates and host cities by industry.`,
    dates: 'Dates', place: 'Venue city', field: 'Industry', verify: 'Last checked', src: 'Source', ddays: d => d > 0 ? `Opens in ${d} days` : d === 0 ? 'Opens today' : 'Ongoing',
    srcline: 'Schedule source: the U.S. Department of Commerce International Trade Administration (trade.gov) list of trade fairs organized in Germany. Dates can change at the organizer\'s discretion, so always re-check the organizer\'s official site before booking travel or booths.',
    detailDesc: f => `${f.n} takes place in ${f.c} on ${T.en.fmt(f.s, f.e)}. ${f.d}.`,
    prepH: 'Pre-visit checklist', guideH: 'How to use a trade fair for sourcing',
    prep: f => [`About 8 weeks before opening: get the exhibitor list, pick 5–10 suppliers to meet and request appointments.`, `About 4 weeks before: book flights and hotel. Rooms in fair cities sell out early.`, `Before departure: check import requirements (certification, labeling, customs) for the products you plan to buy.`, `On site: note MOQ, quote validity, Incoterms, sample cost and certifications at every booth in the same format.`, `Within a week of returning: send thank-you notes with quote and sample requests while the conversation is still fresh.`],
    gdLong: [['A question list beats a business card', 'Time at a booth is short. Asking MOQ, lead time, Incoterms, payment terms, certification and sample cost in the same order makes suppliers comparable.'], ['Second day over first day', 'The first day is crowded. Revisiting key suppliers mid-fair often gets you the technical contact instead of a sales rep.'], ['Convert quotes to landed cost', 'FOB prices from the floor only compare once freight, duty and VAT are added. Use the [landed cost calculator](../landed-cost-calculator.html) to put every quote on the same basis.'], ['Plan around local holidays', 'Replies slow down around local holidays before and after a fair. Check the [global holiday calendar](../global-holiday-calendar.html) when planning the trip.']] },
};
const md = (s, up) => esc(s).replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, h) => `<a href="${up}${h.replace('../', '')}">${t}</a>`);
const gLabel = (g, L) => GROUPS.find(x => x.k === g)[L === 'ko' ? 'ko' : 'en'];
const gIntro = (g, L) => GROUPS.find(x => x.k === g)[L === 'ko' ? 'ki' : 'ei'];
const gColor = { medical: '#b3354a', logistics: '#2f6f9f', consumer: '#a8661c', agri: '#4d7a2b', food: '#c0502a', mobility: '#4a5fb0', building: '#7a6a3a', electronics: '#1f7f86', energy: '#b08d00', chemicals: '#7a3f9d', machinery: '#3f5663', other: '#6b7780' };

const CSS = `:root{--ink:#16232e;--paper:#ece8db;--card:#fbf9f2;--line:#d3cbb6;--rust:#a63d22;--mute:#5a6872}*{box-sizing:border-box}body{background:var(--paper);color:var(--ink);font-family:Inter,system-ui,-apple-system,"Noto Sans KR",sans-serif;margin:0;line-height:1.65}a{color:inherit}header.top{background:var(--ink);padding:14px 20px;display:flex;justify-content:space-between;gap:12px}header.top a{color:#ece8db;text-decoration:none;font-weight:600;font-size:14px}.hero{background:var(--ink);color:#ece8db;padding:8px 20px 28px}.hero .in{max-width:960px;margin:0 auto}.hero h1{font-size:1.65rem;margin:10px 0 6px;line-height:1.3}.hero p{margin:0 0 16px;color:#c9c4b3;font-size:.95rem;max-width:760px;line-height:1.75}.crumb{color:#c9c4b3;font-size:13px;text-decoration:none}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.stat{background:rgba(255,255,255,.07);border-radius:12px;padding:10px 14px}.stat b{display:block;font-size:1.25rem;line-height:1.3}.stat span{font-size:12px;color:#c9c4b3}.wrap{max-width:960px;margin:0 auto;padding:22px 16px 56px}h2.sh{font-size:.95rem;margin:24px 0 10px;color:var(--mute);font-weight:700}.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px}.tile{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--card);border:1px solid var(--line);border-left:4px solid var(--c);border-radius:12px;text-decoration:none;font-size:13.5px;font-weight:600;line-height:1.35}.tile svg{width:22px;height:22px;fill:var(--c);flex:none}.tile small{display:block;font-weight:400;color:var(--mute);font-size:12px}.tile:hover,.tile.on{border-color:var(--ink);border-left-color:var(--c)}.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{padding:5px 12px;border:1px solid var(--line);border-radius:999px;background:var(--card);font-size:13px;text-decoration:none}.chip:hover,.chip.on{border-color:var(--ink)}.chip b{color:var(--mute);font-weight:500}.intro{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:0 0 14px}.intro h2{font-size:1.05rem;margin:0 0 8px}.intro p{margin:6px 0;font-size:14.5px;line-height:1.75}.sf{display:flex;align-items:center;gap:8px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px 12px;margin:14px 0}.sf svg{width:20px;height:20px;fill:var(--mute);flex:none}.sf input{border:0;background:none;font:inherit;width:100%;outline:none;color:var(--ink)}.item{display:grid;grid-template-columns:96px 1fr;gap:14px;background:var(--card);border:1px solid var(--line);border-left:4px solid var(--c);border-radius:12px;padding:12px 14px;margin:8px 0}.item.hasimg{grid-template-columns:96px 1fr 120px;align-items:center}.th{width:120px;height:80px;object-fit:cover;border-radius:8px;background:#ddd6c2}.fig{margin:0 0 14px}.fig img{width:100%;max-height:320px;object-fit:cover;border-radius:12px;display:block;background:#ddd6c2}.fig figcaption{font-size:12px;color:var(--mute);margin-top:6px;line-height:1.5}.fig a{color:inherit}.item.past{opacity:.6}.dt{font-size:12.5px;color:var(--mute);line-height:1.4}.dt b{display:block;color:var(--ink);font-size:15px}.item a.t{font-weight:700;text-decoration:none;font-size:15.5px}.item a.t:hover{text-decoration:underline}.item p{margin:2px 0 0;font-size:13.5px;color:var(--mute)}.tag{display:inline-block;margin:5px 6px 0 0;padding:1px 9px;border-radius:999px;border:1px solid var(--line);font-size:12px;color:var(--ink);text-decoration:none}.tag.hot{background:var(--rust);border-color:var(--rust);color:#fff}.box{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:14px 0}.box h2{font-size:1.05rem;margin:0 0 8px}.box ol,.box ul{padding-left:20px;margin:6px 0}.box li{margin:5px 0;font-size:14.5px}.box p{font-size:14.5px;margin:6px 0}.kv{display:grid;grid-template-columns:110px 1fr;gap:6px 12px;font-size:14.5px}.kv dt{color:var(--mute)}.kv dd{margin:0;font-weight:600}.note{font-size:12.5px;color:var(--mute);margin-top:18px}.tl{display:flex;flex-wrap:wrap;gap:8px}.tl a{padding:6px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card);font-size:13px;text-decoration:none}.fb{margin:14px 0}.fr{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0;align-items:center}.fr select,.fr input[type=date]{font:inherit;font-size:13.5px;padding:7px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink)}.fr label{font-size:13px;color:var(--mute);display:flex;align-items:center;gap:6px}.fr label.ck{color:var(--ink);cursor:pointer}.fr button{font:inherit;font-size:13px;padding:7px 14px;border:1px solid var(--ink);border-radius:10px;background:var(--ink);color:#ece8db;cursor:pointer}.fr button:hover{filter:brightness(1.2)}.fcnt{font-size:13px;color:var(--mute);margin:4px 2px}.fb .sf{margin:0}@media(max-width:640px){.item.hasimg{grid-template-columns:1fr}.th{width:100%;height:150px;order:-1}.stats{grid-template-columns:repeat(2,1fr)}.item{grid-template-columns:1fr;gap:4px}.kv{grid-template-columns:90px 1fr}}`;

function layout(t, { path, title, desc, ld, hero, body, alt, up }) {
  const url = `${BASE}/${t.dir}/${path}`;
  return `<!DOCTYPE html>
<html lang="${t.lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><meta property="og:type" content="website">
<link rel="alternate" hreflang="${t.lang === 'ko' ? 'en' : 'ko'}" href="${BASE}/${t.lang === 'ko' ? 'en/fairs' : 'fairs'}/${path}"><link rel="alternate" hreflang="${t.lang}" href="${url}">
<script type="application/ld+json">${JSON.stringify(ld)}</script><style>${CSS}</style></head><body>
<header class="top"><a href="${up}${t.hub}">CBM LAB · ${t.hubName}</a><a href="${up}${t.lang === 'ko' ? '../en/fairs/' : '../../fairs/'}${path}" hreflang="${t.lang === 'ko' ? 'en' : 'ko'}">${t.other}</a></header>
${hero}<div class="wrap">${body}</div></body></html>`;
}
const daysTo = f => Math.round((Date.parse(f.s) - Date.parse(today)) / 864e5);
function row(f, t, up) {
  const hot = f.status === 'upcoming' && daysTo(f) <= 30, cn = CTRY[f.cc]?.[t.lang === 'ko' ? 0 : 1];
  const place = t.lang === 'ko' ? f.ck : f.c;
  const th = f.img ? `<img class="th" loading="lazy" width="120" height="80" src="${imgUrl(f.img, 240)}" alt="${esc(f.n + (f.img.venue ? (t.lang === 'ko' ? ' 개최지 전시장' : ' venue') : ''))}">` : '';
  return `<article class="item${f.img ? ' hasimg' : ''}${f.status === 'ended' ? ' past' : ''}" style="--c:${gColor[f.g]}" data-g="${f.g}" data-c="${f.cc}" data-s="${f.s}" data-e="${f.e}" data-st="${f.status}" data-q="${esc((f.n + ' ' + f.c + ' ' + f.ck + ' ' + (cn || '')).toLowerCase())}"><div class="dt"><b>${esc(t.fmt(f.s, f.e).split(' – ')[0])}</b>${f.s !== f.e ? '~ ' + esc(t.fmt(f.s, f.e).split(' – ')[1] || '') : ''}</div><div><a class="t" href="${up}f/${f.slug}.html">${esc(f.n)}</a><p>${esc(place)}${cn ? ', ' + esc(cn) : ''} · ${esc(gLabel(f.g, t.lang))}</p>${hot ? `<span class="tag hot">${esc(t.ddays(daysTo(f)))}</span>` : f.status === 'ongoing' ? `<span class="tag hot">${esc(t.ddays(-1))}</span>` : ''}</div>${th}</article>`;
}
const SEARCH_JS_OLD = `<script>(function(){var q=document.getElementById('q');if(!q)return;q.addEventListener('input',function(){var s=q.value.toLowerCase().trim();document.querySelectorAll('.item[data-q]').forEach(function(e){e.style.display=!s||e.dataset.q.indexOf(s)>-1?'':'none'})})})();</script>`;

const filterBar = (t, gUsed, cUsed, months) => { const L = t.lang; return `<div class="fb"><div class="sf">${svg('search')}<input id="q" type="search" placeholder="${t.search}" aria-label="${t.search}"></div><div class="fr"><select id="fg" aria-label="${t.field}"><option value="">${t.field}: ${t.all}</option>${gUsed.map(g => `<option value="${g.k}">${esc(g[L === 'ko' ? 'ko' : 'en'])}</option>`).join('')}</select><select id="fc" aria-label="${t.byC}"><option value="">${t.byC}: ${t.all}</option>${cUsed.map(c => `<option value="${c}">${esc(CTRY[c][L === 'ko' ? 0 : 1])}</option>`).join('')}</select><select id="fm" aria-label="${t.mon}"><option value="">${t.mon}: ${t.all}</option>${months.map(m => `<option value="${m}">${m}</option>`).join('')}</select></div><div class="fr"><label>${t.from}<input id="fd1" type="date"></label><label>${t.to}<input id="fd2" type="date"></label><label class="ck"><input id="f30" type="checkbox"> ${t.l2}</label><label class="ck"><input id="fend" type="checkbox"> ${t.inclEnded}</label><button type="button" id="frs">${t.reset}</button></div><p class="fcnt" id="fcnt" data-u="${t.count}" aria-live="polite"></p></div>`; };
const FILTER_JS = `<script>(function(){var q=document.getElementById('q');if(!q)return;var $=function(i){return document.getElementById(i)},rows=[].slice.call(document.querySelectorAll('.item[data-q]')),h2=document.getElementById('endedH'),cnt=$('fcnt'),T0=new Date(Date.now()+9*36e5).toISOString().slice(0,10),T30=new Date(Date.now()+9*36e5+30*864e5).toISOString().slice(0,10);
function run(){var s=q.value.toLowerCase().trim(),g=$('fg')?$('fg').value:'',c=$('fc')?$('fc').value:'',m=$('fm')?$('fm').value:'',d1=$('fd1')?$('fd1').value:'',d2=$('fd2')?$('fd2').value:'',n30=$('f30')&&$('f30').checked,en=!$('fend')||$('fend').checked,shown=0,endShown=0;
rows.forEach(function(e){var D=e.dataset,ok=(!s||D.q.indexOf(s)>-1)&&(!g||D.g===g)&&(!c||D.c===c)&&(!m||D.s.slice(0,7)===m||D.e.slice(0,7)===m)&&(!d1||D.e>=d1)&&(!d2||D.s<=d2)&&(!n30||(D.s>=T0&&D.s<=T30))&&(en||D.st!=='ended');e.style.display=ok?'':'none';if(ok){shown++;if(D.st==='ended')endShown++}});
if(h2)h2.style.display=endShown?'':'none';if(cnt)cnt.textContent=shown+' '+(cnt.dataset.u||'')}
['q','fg','fc','fm','fd1','fd2','f30','fend'].forEach(function(i){var e=$(i);if(e){e.addEventListener('input',run);e.addEventListener('change',run)}});
var r=$('frs');if(r)r.addEventListener('click',function(){['q','fg','fc','fm','fd1','fd2'].forEach(function(i){if($(i))$(i).value=''});if($('f30'))$('f30').checked=false;if($('fend'))$('fend').checked=false;run()});run()})();</script>`;
const heroHtml = (t, h1, sub, up, crumb) => `<div class="hero"><div class="in">${crumb ? `<a class="crumb" href="${crumb}">← ${esc(t.h1)}</a>` : ''}<h1>${esc(h1)}</h1><p>${esc(sub)}</p></div></div>`;
const files = [];
for (const d of ['fairs', 'en/fairs']) fs.rmSync(d, { recursive: true, force: true });   // pruned fairs must not leave orphan pages
function write(t, rel, html) { const p = `${t.dir}/${rel}`; fs.mkdirSync(p.split('/').slice(0, -1).join('/'), { recursive: true }); fs.writeFileSync(p, html); files.push(p); }
const list = (arr, t, up) => {
  const act = arr.filter(f => f.status !== 'ended'), past = arr.filter(f => f.status === 'ended').reverse();
  return `<div id="list">${act.map(f => row(f, t, up)).join('') || `<p>${t.none}</p>`}</div>${past.length ? `<h2 class="sh" id="endedH">${t.ended}</h2>${past.map(f => row(f, t, up)).join('')}` : ''}`;
};
const itemList = (arr, t, up) => ({ '@type': 'ItemList', numberOfItems: arr.length, itemListElement: arr.slice(0, 50).map((f, i) => ({ '@type': 'ListItem', position: i + 1, url: `${BASE}/${t.dir}/f/${f.slug}.html`, name: f.n })) });
const eventLd = (f, t) => ({ '@type': 'Event', name: f.n, ...(f.img ? { image: imgUrl(f.img, 960) } : {}), startDate: f.s, endDate: f.e, eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', location: { '@type': 'Place', name: f.c, address: { '@type': 'PostalAddress', addressLocality: f.c, ...(CTRY[f.cc] ? { addressCountry: f.cc } : {}) } }, description: f.d, url: `${BASE}/${t.dir}/f/${f.slug}.html` });

for (const t of Object.values(T)) {
  const L = t.lang, active = keep.filter(f => f.status !== 'ended');
  const gUsed = GROUPS.filter(g => keep.some(f => f.g === g.k));
  const cUsed = Object.keys(CTRY).filter(c => keep.filter(f => f.cc === c).length >= 2);
  const tiles = (cur, up) => `<div class="tiles">${gUsed.map(g => `<a class="tile${cur === g.k ? ' on' : ''}" style="--c:${gColor[g.k]}" href="${up}c-${g.k}.html">${svg(g.icon)}<span>${esc(g[L === 'ko' ? 'ko' : 'en'])}<small>${keep.filter(f => f.g === g.k && f.status !== 'ended').length}</small></span></a>`).join('')}</div>`;
  const chips = (cur, up) => `<div class="chips">${cUsed.map(c => `<a class="chip${cur === c ? ' on' : ''}" href="${up}country/${c.toLowerCase()}.html">${esc(CTRY[c][L === 'ko' ? 0 : 1])} <b>${keep.filter(f => f.cc === c && f.status !== 'ended').length}</b></a>`).join('')}</div>`;
  const months = [...new Set(keep.flatMap(f => [f.s.slice(0, 7), f.e.slice(0, 7)]))].sort();
  const search = `<div class="sf">${svg('search')}<input id="q" type="search" placeholder="${t.search}" aria-label="${t.search}"></div>`;
  const guideAt = up => `<section class="box"><h2>${t.guideH}</h2>${t.gdLong.map(([h, p]) => `<p><b>${esc(h)}.</b> ${md(p, up)}</p>`).join('')}</section>`;
  const guide = guideAt('../');
  const note = `<p class="note">${esc(t.srcline)} ${t.fmt ? '' : ''}${L === 'ko' ? '최종 확인일' : 'Last checked'}: ${VERIFIED}</p>`;
  // index
  const n30 = active.filter(f => f.status === 'upcoming' && daysTo(f) <= 30).length;
  let ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: t.title, description: t.sub, url: `${BASE}/${t.dir}/index.html`, inLanguage: L, dateModified: today, mainEntity: itemList(active, t, '') };
  write(t, 'index.html', layout(t, { path: 'index.html', title: t.title, desc: t.sub, ld, up: '', alt: '',
    hero: `<div class="hero"><div class="in"><h1>${esc(t.h1)}</h1><p>${esc(t.sub)}</p><div class="stats"><div class="stat"><b>${active.length}</b><span>${t.l1}</span></div><div class="stat"><b>${n30}</b><span>${t.l2}</span></div><div class="stat"><b>${gUsed.length}</b><span>${t.l3}</span></div><div class="stat"><b>${cUsed.length}</b><span>${t.l4}</span></div></div></div></div>`,
    body: `<h2 class="sh">${t.byG}</h2>${tiles('', '')}<h2 class="sh">${t.byC}</h2>${chips('', '')}${filterBar(t, gUsed, cUsed, months)}${list(keep, t, '')}${guide}${note}${FILTER_JS}` }));
  // groups
  for (const g of gUsed) {
    const arr = keep.filter(f => f.g === g.k), act = arr.filter(f => f.status !== 'ended').length, name = g[L === 'ko' ? 'ko' : 'en'];
    const title = L === 'ko' ? `${name} 전시회 일정 | 해외 박람회 캘린더 — CBM Lab` : `${name} Trade Fairs — Dates & Cities | CBM Lab`;
    const desc = t.gdesc(name, act);
    ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description: desc, url: `${BASE}/${t.dir}/c-${g.k}.html`, inLanguage: L, dateModified: today, mainEntity: itemList(arr, t, '') };
    write(t, `c-${g.k}.html`, layout(t, { path: `c-${g.k}.html`, title, desc, ld, up: '',
      hero: heroHtml(t, t.gd(name), desc, '', 'index.html'),
      body: `<section class="intro"><h2>${esc(name)}</h2><p>${esc(gIntro(g.k, L))}</p></section>${tiles(g.k, '')}${filterBar(t, [], cUsed, months)}${list(arr, t, '')}${guide}${note}${FILTER_JS}` }));
  }
  // countries
  for (const c of cUsed) {
    const arr = keep.filter(f => f.cc === c), name = CTRY[c][L === 'ko' ? 0 : 1], act = arr.filter(f => f.status !== 'ended').length;
    const title = L === 'ko' ? `${name} 전시회 일정 | ${name} 무역박람회 캘린더 — CBM Lab` : `Trade Fairs in ${name} — Upcoming Dates | CBM Lab`;
    const desc = t.cdesc(name, act);
    ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description: desc, url: `${BASE}/${t.dir}/country/${c.toLowerCase()}.html`, inLanguage: L, dateModified: today, mainEntity: itemList(arr, t, '../') };
    write(t, `country/${c.toLowerCase()}.html`, layout(t, { path: `country/${c.toLowerCase()}.html`, title, desc, ld, up: '../',
      hero: heroHtml(t, name + (L === 'ko' ? ' 전시회' : ' trade fairs'), desc, '../', '../index.html'),
      body: `${chips(c, '../')}${filterBar(t, gUsed, [], months)}${list(arr, t, '../')}${note}${FILTER_JS}` }));
  }
  // detail
  for (const f of keep) {
    const g = GROUPS.find(x => x.k === f.g), name = g[L === 'ko' ? 'ko' : 'en'], cn = CTRY[f.cc]?.[L === 'ko' ? 0 : 1], place = L === 'ko' ? f.ck : f.c;
    const title = L === 'ko' ? `${f.n} ${f.s.slice(0, 4)} 일정·장소 | ${place} ${name} 전시회 — CBM Lab` : `${f.n} ${f.s.slice(0, 4)} — Dates & Venue (${place}) | CBM Lab`;
    const desc = t.detailDesc(f).slice(0, 300);
    const related = arr => arr.filter(x => x.g === f.g && x.slug !== f.slug && x.status !== 'ended').slice(0, 6);
    ld = { '@context': 'https://schema.org', '@graph': [eventLd(f, t), { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: t.h1, item: `${BASE}/${t.dir}/index.html` }, { '@type': 'ListItem', position: 2, name, item: `${BASE}/${t.dir}/c-${f.g}.html` }, { '@type': 'ListItem', position: 3, name: f.n }] }] };
    const status = f.status === 'ended' ? (L === 'ko' ? '이 전시회는 종료되었습니다. 다음 회차 일정은 주최 측 공식 사이트에서 확인하세요.' : 'This fair has ended. Check the organizer\'s official site for the next edition.') : f.status === 'ongoing' ? t.ddays(-1) : t.ddays(daysTo(f));
    const rel = related(keep);
    write(t, `f/${f.slug}.html`, layout(t, { path: `f/${f.slug}.html`, title, desc, ld, up: '../',
      hero: heroHtml(t, f.n, desc, '../', `../c-${f.g}.html`).replace(`← ${esc(t.h1)}`, `← ${esc(name)}`),
      body: `${f.img ? `<figure class="fig"><img src="${imgUrl(f.img, 960)}" width="960" height="540" alt="${esc(f.n + (f.img.venue ? (L === 'ko' ? ' 개최지 전시장' : ' venue') : ''))}"><figcaption>${f.img.venue ? (L === 'ko' ? '개최지 전시장 사진(해당 전시회 현장 사진이 아닙니다). ' : 'Photo of the host venue, not of this fair. ') : ''}${esc(L === 'ko' ? '사진' : 'Photo')}: ${esc(f.img.a)}, <a href="${imgPage(f.img)}" rel="noopener nofollow">${esc(f.img.lic)}</a>, Wikimedia Commons</figcaption></figure>` : ''}<section class="box"><dl class="kv"><dt>${t.dates}</dt><dd>${esc(t.fmt(f.s, f.e))}</dd><dt>${t.place}</dt><dd>${esc(place)}${cn ? ', ' + esc(cn) : ''}</dd><dt>${t.field}</dt><dd><a href="../c-${f.g}.html">${esc(name)}</a></dd><dt>${L === 'ko' ? '상태' : 'Status'}</dt><dd>${esc(status)}</dd><dt>${t.verify}</dt><dd>${VERIFIED}</dd></dl>${L === 'en' ? `<p>${esc(f.d)}.</p>` : `<p>${esc(gIntro(f.g, 'ko'))}</p>`}</section>
<section class="box"><h2>${t.prepH}</h2><ol>${t.prep(f).map(x => `<li>${esc(x)}</li>`).join('')}</ol></section>${guideAt('../../')}
<section class="box"><h2>${L === 'ko' ? '함께 쓰는 도구' : 'Related tools'}</h2><div class="tl">${t.tools.map(([h, n]) => `<a href="../../${h}">${esc(n)}</a>`).join('')}</div></section>
${rel.length ? `<h2 class="sh">${L === 'ko' ? `같은 분야의 다른 전시회` : 'More fairs in this industry'}</h2>${rel.map(x => row(x, t, '../')).join('')}` : ''}${note}` }));
  }
}
console.log(`fairs: ${keep.length} kept, ${dropped.length} pruned, ${files.length} pages${warn.length ? '\nWARN:\n' + warn.join('\n') : ''}`);
