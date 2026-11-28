// Builds the trade-fair directory: fairs/ (KO) and en/fairs/ (EN). Source of truth: data/fairs/fairs.txt
// Line format: name|start YYYY-MM-DD|end YYYY-MM-DD|city|description[|official URL]
// Auto-prune: fairs that ended more than PRUNE_DAYS ago are removed from the data file itself (keeps the repo small).
import { UI_CSS } from '../shared/ui.mjs';
import { COMPLY, GUIDE, FTA_LINK } from './content.mjs';
import fs from 'fs';
import crypto from 'crypto';
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
const CONTS = [
  { k: 'asia', c: '#b4781f', ko: '아시아', en: 'Asia', codes: 'JP CN HK TW KR SG TH MY ID VN PH IN PK BD LK KH LA MM MN KZ UZ KG TJ TM AZ GE AM NP BT MO BN MV' },
  { k: 'mideast', c: '#8a5a2b', ko: '중동', en: 'Middle East', codes: 'AE SA QA KW BH OM IL JO LB IQ IR TR EG SY YE PS' },
  { k: 'europe', c: '#3f64a3', ko: '유럽', en: 'Europe', codes: 'DE FR GB IT ES NL BE AT CH SE NO DK FI PL CZ SK HU RO BG GR PT IE LU HR SI RS BA ME MK AL XK EE LV LT UA MD BY RU IS MT CY' },
  { k: 'namerica', c: '#7b4f8c', ko: '북중미', en: 'North & Central America', codes: 'US CA MX GT HN SV NI CR PA CU DO JM HT BS BB TT PR' },
  { k: 'samerica', c: '#23808a', ko: '남미', en: 'South America', codes: 'BR AR CL CO PE EC UY PY BO VE' },
  { k: 'africa', c: '#4c7f4f', ko: '아프리카', en: 'Africa', codes: 'ZA NG KE GH ET TZ UG MA DZ TN SN CI CM AO MZ ZW ZM RW MU' },
  { k: 'oceania', c: '#bb5577', ko: '오세아니아', en: 'Oceania', codes: 'AU NZ FJ PG' },
];
const CC_CONT = {}; for (const c of CONTS) for (const cc of c.codes.split(' ')) CC_CONT[cc] = c.k;
const keep = [], dropped = [], seen = new Set(), warn = [];
const pruneBefore = addDays(today, -PRUNE_DAYS);
const KO_CITY = { Seoul: '서울', Goyang: '고양', Busan: '부산', Daegu: '대구', Incheon: '인천', Changwon: '창원', Gwangju: '광주', Daejeon: '대전', Ulsan: '울산', Sejong: '세종', Seongnam: '성남', Suwon: '수원', Yongin: '용인', Hwaseong: '화성', Jeju: '제주', Pyeongtaek: '평택', Gimhae: '김해', Cheongju: '청주', Jeonju: '전주', Gyeongju: '경주', Ansan: '안산', Paju: '파주', Gunsan: '군산', Pohang: '포항', Gumi: '구미', Birmingham: '버밍엄', 'São Paulo': '상파울루', Izmir: '이즈미르', Bangkok: '방콕', Hanoi: '하노이', Miami: '마이애미', Bali: '발리', Madrid: '마드리드', 'Kuala Lumpur': '쿠알라룸푸르', Rho: '로(밀라노)', Milano: '밀라노', Bergamo: '베르가모', Lyon: '리옹', Bordeaux: '보르도', Villepinte: '빌팽트', 'Le Bourget': '르부르제', 'Kuwait City': '쿠웨이트시티', Riyadh: '리야드', Baghdad: '바그다드', Erbil: '에르빌', Chennai: '첸나이', 'Greater Noida': '그레이터 노이다', Mumbai: '뭄바이', 'New Delhi': '뉴델리', Gandhinagar: '간디나가르', Tokyo: '도쿄', Osaka: '오사카', Nagoya: '나고야', Fukuoka: '후쿠오카', Sapporo: '삿포로', Yokohama: '요코하마', Seoul: '서울', Goyang: '고양', Incheon: '인천', Busan: '부산', Paris: '파리', Milan: '밀라노', Shanghai: '상하이', Guangzhou: '광저우', Shenzhen: '선전', Beijing: '베이징', 'Hong Kong': '홍콩', Taipei: '타이베이', Bangkok: '방콕', Jakarta: '자카르타', 'Kuala Lumpur': '쿠알라룸푸르', Dubai: '두바이', 'Abu Dhabi': '아부다비', Istanbul: '이스탄불', Lagos: '라고스', Brussels: '브뤼셀', Chicago: '시카고', Orlando: '올랜도', 'New York City': '뉴욕', Mumbai: '뭄바이', 'New Delhi': '뉴델리', Utrecht: '위트레흐트', Amsterdam: '암스테르담', Vienna: '빈', Warsaw: '바르샤바', Madrid: '마드리드', Birmingham: '버밍엄', Toronto: '토론토', 'São Paulo': '상파울루' };
for (const line of raw) {
  const [n, s, e, c, d, u, cc, sr] = line.split('|').map(x => x?.trim());
  const ok = n && /^\d{4}-\d{2}-\d{2}$/.test(s) && /^\d{4}-\d{2}-\d{2}$/.test(e) && c && (d || /^[A-Z]{2}$/.test(cc || '')) && !Number.isNaN(Date.parse(s)) && !Number.isNaN(Date.parse(e));
  if (!ok) { warn.push('bad line: ' + line); continue; }            // missing/"TBD" dates are never published
  if (e < s) { warn.push('end<start: ' + line); continue; }
  if (/^[A-Z]{2}$/.test(cc || '') && !CITY[c]) CITY[c] = [cc, KO_CITY[c] || c];
  if (!CITY[c]) warn.push('unknown city (country unset): ' + c);
  const key = `${n.toLowerCase()}|${s}`;                              // duplicate = same name + start
  if (seen.has(key)) { warn.push('dup: ' + n); continue; }
  seen.add(key);
  if (e < pruneBefore) { dropped.push(n); continue; }
  keep.push({ n, s, e, c, d: d || '', u: u || '', cc0: cc || '', sr: sr || 'trade-gov' });
}
keep.sort((a, b) => a.s.localeCompare(b.s) || a.n.localeCompare(b.n));
if (dropped.length) fs.writeFileSync('data/fairs/fairs.txt', keep.map(f => { const a = [f.n, f.s, f.e, f.c, f.d, f.u, f.cc0, f.sr === 'trade-gov' && !f.cc0 ? '' : f.sr]; while (a.length > 5 && !a[a.length - 1]) a.pop(); return a.join('|'); }).join('\n') + '\n');
// ---- auto-collected fairs (data/fairs/auto.json, written by collect.mjs): curated entries always win on name+start -------
const dnKo = new Intl.DisplayNames(['ko'], { type: 'region' }), dnEn = new Intl.DisplayNames(['en'], { type: 'region' });
let autoN = 0;
if (fs.existsSync('data/fairs/auto.json')) for (const a of JSON.parse(fs.readFileSync('data/fairs/auto.json', 'utf8'))) {
  const key = `${a.n.toLowerCase()}|${a.s}`;
  if (seen.has(key) || a.e < pruneBefore || !/^[A-Z]{2}$/.test(a.cc || '') || !a.c) continue;
  seen.add(key);
  if (!CITY[a.c]) CITY[a.c] = [a.cc, KO_CITY[a.c] || a.c];
  if (!CTRY[a.cc]) { try { CTRY[a.cc] = [dnKo.of(a.cc), dnEn.of(a.cc)]; } catch { continue; } }
  keep.push({ n: a.n, s: a.s, e: a.e, c: a.c, d: '', u: a.u || '', auto: a.source, vn: /^venue:/.test(a.source) ? a.source.slice(6) : '', sr: a.source === 'wikidata' ? 'wikidata' : /^venue:/.test(a.source) ? 'venue-cal' : a.source === 'tourapi' ? 'tourapi' : 'organizer-ld' }); autoN++;
}
keep.sort((a, b) => a.s.localeCompare(b.s) || a.n.localeCompare(b.n));
for (const f of keep) {
  f.g = groupOf(f); f.cc = CITY[f.c]?.[0] || 'XX'; f.k = CC_CONT[f.cc] || 'other'; f.ck = CITY[f.c]?.[1] || f.c;
  const sameName = keep.filter(x => x.n === f.n).length > 1;
  { let b = slugify(f.n).replace(new RegExp('-' + f.s.slice(0, 4) + '$'), ''); if (b.replace(/[\d-]/g, '').length < 3 || b === 'x') b = 'fair-' + crypto.createHash('sha1').update(f.n).digest('hex').slice(0, 6); f.slug = b + '-' + f.s.slice(0, sameName ? 7 : 4); }
  f.status = f.e < today ? 'ended' : f.s <= today ? 'ongoing' : 'upcoming';
}
for (const f of keep) if (f.cc && f.cc !== 'XX' && !CTRY[f.cc]) { try { CTRY[f.cc] = [dnKo.of(f.cc), dnEn.of(f.cc)]; } catch {} }
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
    quick: '빠른 기간 선택', thisM: '이번 달', nextM: '다음 달', in30: '30일 내', in90: '90일 내', sort: '정렬', byDate: '일정순', byName: '이름순', adv: '기간 직접 지정 · 종료 포함', mon: '개최월', from: '시작일 이후', to: '종료일 이전', inclEnded: '종료된 전시회 포함', reset: '초기화', count: '건',
    title: '세계 전시회 일정 | 품목별 해외 무역박람회 캘린더 — CBM Lab', h1: '세계 전시회 일정', up: '예정·진행 중', ended: '최근 종료', all: '전체', byG: '품목별 전시회', byC: '국가별', search: '전시회·도시 검색', none: '조건에 맞는 전시회가 없습니다.',
    sub: '해외 소싱과 수출 상담에 쓰는 무역박람회를 품목별로 모았습니다. 기간·도시·분야를 한눈에 보고, 종료 후 60일이 지난 전시회는 자동으로 목록에서 빠집니다.',
    l1: '예정·진행 중 전시회', l2: '30일 내 개막', l3: '품목 분야', l4: '개최 국가', nUp: n => `예정·진행 중 ${n}건`, nG: n => `${n}개 품목`, nC: n => `${n}개국`, next30: n => `30일 내 개막 ${n}건`,
    gd: n => `${n} 전시회`, gdesc: (n, k) => `${n} 분야 해외 전시회 일정 ${k}건. 기간, 개최 도시, 방문 전 준비사항을 정리했습니다.`,
    cdesc: (n, k) => `${n}에서 열리는 전시회 일정 ${k}건. 품목별로 기간과 도시를 확인하세요.`,
    dates: '일정', place: '개최지', field: '분야', verify: '최종 확인일', src: '출처', ddays: d => d > 0 ? `개막 D-${d}` : d === 0 ? '오늘 개막' : '진행 중',
    srcline: '일정 출처: 미국 상무부 International Trade Administration(trade.gov)의 독일 주최 무역박람회 목록. 전시회 일정은 주최 측 사정으로 바뀔 수 있으므로 참가·출장 확정 전에는 반드시 주최 측 공식 사이트에서 다시 확인하세요. 일부 일정은 공개 데이터(Wikidata CC0, 주최 측이 공개한 구조화 일정)에서 매일 자동으로 수집하며, 자동 수집 항목은 설명 없이 일정·장소만 표시합니다.',
    detailDesc: f => `${f.n} — ${f.ck}에서 ${T.ko.fmt(f.s, f.e)} 열리는 ${GROUPS.find(g => g.k === f.g).ko} 분야 전시회입니다.`,
    prepH: '방문 전 준비 체크리스트', guideH: '전시회를 소싱에 쓰는 방법',
    prep: f => [`개막 약 8주 전: 참가업체 목록을 받아 만나고 싶은 업체 5~10곳을 정하고 미팅을 요청합니다.`, `개막 약 4주 전: 항공편과 숙소를 확정합니다. 전시 기간 도시 숙박은 일찍 마감됩니다.`, `출국 전: 구매하려는 품목의 한국 수입 요건(인증·표시·통관)을 미리 확인합니다.`, `현장: 부스마다 MOQ, 견적 유효기간, 인코텀즈, 샘플 비용, 인증 보유 여부를 같은 양식으로 메모합니다.`, `귀국 후 1주 안: 감사 메일과 함께 견적·샘플 요청을 보내야 기억이 남아 있을 때 협상이 이어집니다.`],
    gdLong: [['명함보다 질문 목록', '부스에서는 시간이 길지 않습니다. MOQ, 납기, 인코텀즈, 결제 조건, 인증, 샘플 비용 여섯 가지를 같은 순서로 물어보면 업체 간 비교가 쉬워집니다.'], ['첫날보다 둘째 날', '첫날은 사람이 몰려 깊은 대화가 어렵습니다. 중간 일정에 핵심 업체를 다시 방문하면 영업 담당이 아닌 기술 담당과 이야기할 수 있는 경우가 많습니다.'], ['견적은 착지원가로 환산', '전시장에서 받은 FOB 단가는 운임·관세·부가세를 더해야 비교가 됩니다. 귀국 후 [착지원가 계산기](../landed-cost-calculator.html)로 같은 조건에 맞춰 환산해 보세요.'], ['일정은 공휴일과 함께', '전시 전후 현지 공휴일에는 업체 회신이 늦어집니다. 출장 일정은 [세계 공휴일 달력](../global-holiday-calendar.html)과 함께 보세요.']] },
  en: { lang: 'en', dir: 'en/fairs', loc: 'en-US', hub: '../../data-radar-hub.html', hubName: 'Data Radar', other: '한국어', tools: [['cbm-calculator.html', 'CBM calculator'], ['landed-cost-calculator.html', 'Landed cost calculator'], ['incoterms-guide.html', 'Incoterms guide'], ['hs-code-guide.html', 'HS code guide'], ['global-holiday-calendar.html', 'Global holiday calendar']],
    fmt: (s, e) => { const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; const a = s.split('-'), b = e.split('-'); const A = `${M[+a[1] - 1]} ${+a[2]}`, B = `${M[+b[1] - 1]} ${+b[2]}`; return s === e ? `${A}, ${a[0]}` : a[0] === b[0] ? `${A} – ${B}, ${a[0]}` : `${A}, ${a[0]} – ${B}, ${b[0]}`; },
    quick: 'Quick date range', thisM: 'This month', nextM: 'Next month', in30: 'Next 30 days', in90: 'Next 90 days', sort: 'Sort', byDate: 'By date', byName: 'By name', adv: 'Custom dates · include ended', mon: 'Month', from: 'From', to: 'Until', inclEnded: 'Include ended fairs', reset: 'Reset', count: 'fairs',
    title: 'Trade Fair Calendar by Industry — Upcoming Trade Shows Worldwide | CBM Lab', h1: 'Trade Fair Calendar', up: 'Upcoming & ongoing', ended: 'Recently ended', all: 'All', byG: 'Trade fairs by industry', byC: 'By country', search: 'Search fair or city', none: 'No trade fairs match.',
    sub: 'Trade shows for overseas sourcing and export meetings, grouped by industry. See dates, city and sector at a glance. Fairs that ended more than 60 days ago drop off the list automatically.',
    l1: 'Upcoming & ongoing fairs', l2: 'Opening within 30 days', l3: 'Industries', l4: 'Host countries', nUp: n => `${n} upcoming or ongoing`, nG: n => `${n} industries`, nC: n => `${n} countries`, next30: n => `${n} opening within 30 days`,
    gd: n => `${n} trade fairs`, gdesc: (n, k) => `${k} upcoming ${n} trade fairs with dates, host city and a pre-visit checklist.`,
    cdesc: (n, k) => `${k} trade fairs held in ${n}, with dates and host cities by industry.`,
    dates: 'Dates', place: 'Venue city', field: 'Industry', verify: 'Last checked', src: 'Source', ddays: d => d > 0 ? `Opens in ${d} days` : d === 0 ? 'Opens today' : 'Ongoing',
    srcline: 'Schedule source: the U.S. Department of Commerce International Trade Administration (trade.gov) list of trade fairs organized in Germany. Dates can change at the organizer\'s discretion, so always re-check the organizer\'s official site before booking travel or booths. Some entries are collected automatically every day from open data (Wikidata, CC0) and structured schedules published by organizers; those show dates and venue only.',
    detailDesc: f => `${f.n} takes place in ${f.c} on ${T.en.fmt(f.s, f.e)}.${f.d ? ' ' + f.d + '.' : ''}`,
    prepH: 'Pre-visit checklist', guideH: 'How to use a trade fair for sourcing',
    prep: f => [`About 8 weeks before opening: get the exhibitor list, pick 5–10 suppliers to meet and request appointments.`, `About 4 weeks before: book flights and hotel. Rooms in fair cities sell out early.`, `Before departure: check import requirements (certification, labeling, customs) for the products you plan to buy.`, `On site: note MOQ, quote validity, Incoterms, sample cost and certifications at every booth in the same format.`, `Within a week of returning: send thank-you notes with quote and sample requests while the conversation is still fresh.`],
    gdLong: [['A question list beats a business card', 'Time at a booth is short. Asking MOQ, lead time, Incoterms, payment terms, certification and sample cost in the same order makes suppliers comparable.'], ['Second day over first day', 'The first day is crowded. Revisiting key suppliers mid-fair often gets you the technical contact instead of a sales rep.'], ['Convert quotes to landed cost', 'FOB prices from the floor only compare once freight, duty and VAT are added. Use the [landed cost calculator](../landed-cost-calculator.html) to put every quote on the same basis.'], ['Plan around local holidays', 'Replies slow down around local holidays before and after a fair. Check the [global holiday calendar](../global-holiday-calendar.html) when planning the trip.']] },
};
const md = (s, up) => esc(s).replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, h) => `<a href="${up}${h.replace('../', '')}">${t}</a>`);
const gLabel = (g, L) => GROUPS.find(x => x.k === g)[L === 'ko' ? 'ko' : 'en'];
const gIntro = (g, L) => GROUPS.find(x => x.k === g)[L === 'ko' ? 'ki' : 'ei'];
const gColor = { medical: '#b3354a', logistics: '#2f6f9f', consumer: '#a8661c', agri: '#4d7a2b', food: '#c0502a', mobility: '#4a5fb0', building: '#7a6a3a', electronics: '#1f7f86', energy: '#b08d00', chemicals: '#7a3f9d', machinery: '#3f5663', other: '#6b7780' };

const CSS = `:root{--ink:#16232e;--paper:#ece8db;--card:#fbf9f2;--line:#d3cbb6;--rust:#a63d22;--mute:#5a6872}*{box-sizing:border-box}body{background:var(--paper);color:var(--ink);font-family:Inter,system-ui,-apple-system,"Noto Sans KR",sans-serif;margin:0;line-height:1.65}a{color:inherit}header.top{background:var(--ink);padding:14px 20px;display:flex;justify-content:space-between;gap:12px}header.top a{color:#ece8db;text-decoration:none;font-weight:600;font-size:14px}.hero{background:var(--ink);color:#ece8db;padding:8px 20px 28px}.hero .in{max-width:960px;margin:0 auto}.hero h1{font-size:1.65rem;margin:10px 0 6px;line-height:1.3}.hero p{margin:0 0 16px;color:#c9c4b3;font-size:.95rem;max-width:760px;line-height:1.75}.crumb{color:#c9c4b3;font-size:13px;text-decoration:none}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.stat{background:rgba(255,255,255,.07);border-radius:12px;padding:10px 14px}.stat b{display:block;font-size:1.25rem;line-height:1.3}.stat span{font-size:12px;color:#c9c4b3}.wrap{max-width:960px;margin:0 auto;padding:22px 16px 56px}h2.sh{font-size:.95rem;margin:24px 0 10px;color:var(--mute);font-weight:700}.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px}.tile{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--card);border:1px solid var(--line);border-left:4px solid var(--c);border-radius:12px;text-decoration:none;font-size:13.5px;font-weight:600;line-height:1.35}.tile svg{width:22px;height:22px;fill:var(--c);flex:none}.tile small{display:block;font-weight:400;color:var(--mute);font-size:12px}.tile:hover,.tile.on{border-color:var(--ink);border-left-color:var(--c)}.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{padding:5px 12px;border:1px solid var(--line);border-radius:999px;background:var(--card);font-size:13px;text-decoration:none}.chip:hover,.chip.on{border-color:var(--ink)}.chip b{color:var(--mute);font-weight:600;margin-left:2px}.chip.all{display:inline-flex;gap:4px;align-items:center}.chip.all svg{width:14px;height:14px;fill:currentColor}.pager{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:18px 0 4px}.pager button{min-width:38px;height:38px;padding:0 12px;border:1px solid var(--line);border-radius:8px;background:var(--card);font:inherit;cursor:pointer}.pager button:hover:not(:disabled){border-color:var(--ink)}.pager button.cur{background:var(--ink);color:#fff;border-color:var(--ink)}.pager button:disabled{opacity:.4;cursor:default}.pager .gap{align-self:center;color:var(--mute)}.pinfo{text-align:center;color:var(--mute);font-size:13px;margin:0 0 8px}.fam{margin:18px 0 8px;font-size:15px;border-left:4px solid var(--c);padding-left:10px}.fam a{text-decoration:none}.chip b{color:var(--mute);font-weight:500}.intro{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:0 0 14px}.intro h2{font-size:1.05rem;margin:0 0 8px}.intro p{margin:6px 0;font-size:14.5px;line-height:1.75}.sf{display:flex;align-items:center;gap:8px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px 12px;margin:14px 0}.sf svg{width:20px;height:20px;fill:var(--mute);flex:none}.sf input{border:0;background:none;font:inherit;width:100%;outline:none;color:var(--ink)}.item{display:grid;grid-template-columns:96px 1fr;gap:14px;background:var(--card);border:1px solid var(--line);border-left:4px solid var(--c);border-radius:12px;padding:12px 14px;margin:8px 0}.item.hasimg{grid-template-columns:96px 1fr 120px;align-items:center}.th{width:120px;height:80px;object-fit:cover;border-radius:8px;background:#ddd6c2}.fig{margin:0 0 14px}.fig img{width:100%;max-height:320px;object-fit:cover;border-radius:12px;display:block;background:#ddd6c2}.fig figcaption{font-size:12px;color:var(--mute);margin-top:6px;line-height:1.5}.fig a{color:inherit}.item.past{opacity:.6}.dt{font-size:12.5px;color:var(--mute);line-height:1.4}.dt b{display:block;color:var(--ink);font-size:15px}.item a.t{font-weight:700;text-decoration:none;font-size:15.5px}.item a.t:hover{text-decoration:underline}.item p{margin:2px 0 0;font-size:13.5px;color:var(--mute)}.tag{display:inline-block;margin:5px 6px 0 0;padding:1px 9px;border-radius:999px;border:1px solid var(--line);font-size:12px;color:var(--ink);text-decoration:none}.tag.hot{background:var(--rust);border-color:var(--rust);color:#fff}.box{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:14px 0}.box h2{font-size:1.05rem;margin:0 0 8px}.box ol,.box ul{padding-left:20px;margin:6px 0}.box li{margin:5px 0;font-size:14.5px}.box p{font-size:14.5px;margin:6px 0}.kv{display:grid;grid-template-columns:110px 1fr;gap:6px 12px;font-size:14.5px}.kv dt{color:var(--mute)}.kv dd{margin:0;font-weight:600}.note{font-size:12.5px;color:var(--mute);margin-top:18px}.tl{display:flex;flex-wrap:wrap;gap:8px}.tl a{padding:6px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card);font-size:13px;text-decoration:none}.fb{margin:14px 0;}.tlst{margin:8px 0 0;padding-left:20px}.tlst li{margin:6px 0;line-height:1.65}.tlst b{display:block;font-size:13.5px;color:var(--mute)}.qk{display:flex;gap:6px;overflow-x:auto;margin:8px 0;padding-bottom:2px}.qk button{white-space:nowrap;border:1px solid var(--line);background:var(--card);border-radius:999px;padding:6px 14px;font-size:13px;cursor:pointer;color:var(--ink)}.qk .rs{margin-left:auto;background:none;color:var(--mute)}.qk button.on{background:var(--ink);color:#ece8db;border-color:var(--ink)}.adv{margin:4px 0;font-size:13px}.adv summary{cursor:pointer;color:var(--mute)}.fr{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0;align-items:center}.fr select,.fr input[type=date]{font:inherit;font-size:13.5px;padding:7px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink)}.fr label{font-size:13px;color:var(--mute);display:flex;align-items:center;gap:6px}.fr label.ck{color:var(--ink);cursor:pointer}.fr button{font:inherit;font-size:13px;padding:7px 14px;border:1px solid var(--ink);border-radius:10px;background:var(--ink);color:#ece8db;cursor:pointer}.fr button:hover{filter:brightness(1.2)}.fcnt{font-size:13px;color:var(--mute);margin:4px 2px}.fb .sf{margin:0}@media(max-width:640px){.item.hasimg{grid-template-columns:1fr}.th{width:100%;height:150px;order:-1}.stats{grid-template-columns:repeat(2,1fr)}.item{grid-template-columns:1fr;gap:4px}.kv{grid-template-columns:90px 1fr}}`;

function layout(t, { path, title, desc, ld, hero, body, alt, up }) {
  const url = `${BASE}/${t.dir}/${path}`;
  return `<!DOCTYPE html>
<html lang="${t.lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><meta property="og:type" content="website">
<link rel="alternate" hreflang="${t.lang === 'ko' ? 'en' : 'ko'}" href="${BASE}/${t.lang === 'ko' ? 'en/fairs' : 'fairs'}/${path}"><link rel="alternate" hreflang="${t.lang}" href="${url}">
<script type="application/ld+json">${JSON.stringify(ld)}</script><style>${CSS}${UI_CSS}</style></head><body>
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
const heroHtml = (t, h1, sub, up, crumb) => `<div class="hero"><div class="in">${crumb ? `<a class="crumb" href="${crumb}">← ${esc(t.h1)}</a>` : ''}<h1>${esc(h1)}</h1><p>${esc(sub)}</p></div></div>`;
const files = [];
for (const d of ['fairs', 'en/fairs']) fs.rmSync(d, { recursive: true, force: true });   // pruned fairs must not leave orphan pages
function write(t, rel, html) { const p = `${t.dir}/${rel}`; fs.mkdirSync(p.split('/').slice(0, -1).join('/'), { recursive: true }); fs.writeFileSync(p, html); files.push(p); }
const list = (arr, t, up) => {
  const act = arr.filter(f => f.status !== 'ended'), past = arr.filter(f => f.status === 'ended').reverse();
  return `<div id="list">${act.map(f => row(f, t, up)).join('') || `<p>${t.none}</p>`}</div>${past.length ? `<h2 class="sh" id="endedH">${t.ended}</h2>${past.map(f => row(f, t, up)).join('')}` : ''}`;
};
const itemList = (arr, t, up) => ({ '@type': 'ItemList', numberOfItems: arr.length, itemListElement: arr.slice(0, 50).map((f, i) => ({ '@type': 'ListItem', position: i + 1, url: `${BASE}/${t.dir}/f/${f.slug}.html`, name: f.n })) });
const eventLd = (f, t) => ({ '@type': 'Event', name: f.n, ...(f.img ? { image: imgUrl(f.img, 960) } : {}), startDate: f.s, endDate: f.e, eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', location: { '@type': 'Place', name: f.c, address: { '@type': 'PostalAddress', addressLocality: f.c, ...(CTRY[f.cc] ? { addressCountry: f.cc } : {}) } }, ...(f.d ? { description: f.d } : {}), url: `${BASE}/${t.dir}/f/${f.slug}.html` });

const SRC = {
  'trade-gov': { ko: '미국 상무부(trade.gov) 독일 주최 박람회 목록', en: 'U.S. Dept. of Commerce (trade.gov) — fairs in Germany', cr: { ko: '출처: 미국 상무부 International Trade Administration(trade.gov)의 독일 주최 박람회 목록(미국 정부 공개 자료)', en: 'Source: U.S. International Trade Administration (trade.gov), list of trade fairs organized in Germany (U.S. government public data)' } },
  official: { ko: '주최·전시장 공식 일정', en: 'Organizer & venue official schedules', cr: { ko: '출처: 각 전시회 주최 측·전시장 공식 사이트의 공개 일정', en: 'Source: schedules published on each organizer\'s or venue\'s official website' } },
  'enterprise-sg': { ko: '싱가포르 Enterprise Singapore 박람회 목록', en: 'Enterprise Singapore trade fair list', cr: { ko: '출처: Enterprise Singapore(싱가포르 정부기관) 예정 박람회 목록', en: 'Source: Enterprise Singapore (Singapore government agency), list of upcoming trade fairs' } },
  'in-embassy': { ko: '주요 대사관 공개 전시회 일정(인도)', en: 'Indian embassies — trade fair calendars', cr: { ko: '출처: 인도 대사관·영사관이 공개한 인도 전시회 일정표', en: 'Source: trade fair calendars published by Indian embassies' } },
  'ahk-iraq': { ko: '독일-이라크 상공회의소(AHK) 일정', en: 'German-Iraqi Chamber (AHK) calendar', cr: { ko: '출처: 독일 해외상공회의소(AHK) 이라크의 전시회 목록', en: 'Source: German Chamber of Commerce (AHK Iraq) exhibitions list' } },
  'iraq-mot': { ko: '이라크 상무부 발표', en: 'Iraqi Ministry of Trade announcement', cr: { ko: '출처: 이라크 상무부 산하 전시회·상업서비스 공사가 발표한 일정', en: 'Source: Iraqi General Company for Exhibitions and Commercial Services (Ministry of Trade)' } },
  kif: { ko: '쿠웨이트 국제박람회장(KIF) 공식 일정', en: 'Kuwait International Fairground (KIF) schedule', cr: { ko: '출처: 쿠웨이트 국제박람회장(Kuwait International Fair) 공식 행사 일정표', en: 'Source: official events schedule of the Kuwait International Fairground' } },
  lombardia: { ko: '이탈리아 롬바르디아주 공식 박람회 캘린더', en: 'Lombardy Region official fair calendar', cr: { ko: '출처: 이탈리아 롬바르디아주정부 「2027년 롬바르디아 국제 박람회 캘린더」', en: 'Source: Regione Lombardia, international trade fair calendar for 2027' } },
  promosalons: { ko: '프랑스 Promosalons 박람회 캘린더', en: 'Promosalons fair calendar (France)', cr: { ko: '출처: Promosalons 2026-27 프랑스 박람회 캘린더', en: 'Source: Promosalons 2026-27 calendar of fairs in France' } },
  'ice-italy': { ko: '이탈리아 무역공사(ICE) 해외 전시회 목록', en: 'Italian Trade Agency (ICE) fair lists', cr: { ko: '출처: 이탈리아 무역공사(ICE)가 공개한 국가별 전시회 목록', en: 'Source: country fair lists published by the Italian Trade Agency (ICE)' } },
  jetro: { ko: 'JETRO 해외 전시회 데이터베이스(J-messe)', en: 'JETRO trade fair database (J-messe)', cr: { ko: '출처: 일본무역진흥기구(JETRO) J-messe 데이터베이스', en: 'Source: JETRO (Japan External Trade Organization) J-messe database' } },
  wikidata: { ko: 'Wikidata 공개 데이터', en: 'Wikidata open data', cr: { ko: '출처: Wikidata (CC0 공개 데이터)', en: 'Source: Wikidata (CC0 open data)' } },
  'venue-cal': { ko: '전시장 공식 일정', en: 'Exhibition-centre calendars', cr: { ko: '출처: 코엑스·킨텍스·벡스코·엑스코 등 전시장 공식 사이트의 공개 일정', en: 'Source: public schedules on the official websites of exhibition centres (COEX, KINTEX, BEXCO, EXCO and others)' } },
  tourapi: { ko: '한국관광공사 행사정보', en: 'Korea Tourism Organization events', cr: { ko: '출처: 한국관광공사 국문 관광정보 서비스 행사정보(공공데이터포털)', en: 'Source: Korea Tourism Organization event information (data.go.kr)' } },
  'organizer-ld': { ko: '주최 측 공개 구조화 일정', en: 'Organizer structured schedules', cr: { ko: '출처: 주최 측 사이트가 구조화 데이터(schema.org)로 공개한 일정', en: 'Source: schedules published by organizers as structured data (schema.org)' } },
};
Object.assign(T.ko, { continent: '대륙', continents: '대륙별', allC: '전체 국가', countries: '국가별', allCountries: '전체 국가 보기', srcs: '일정 출처', perPage: '페이지당', prev: '이전', next: '다음', loading: '불러오는 중…', pages: '페이지 이동', home: '세계 전시회 일정',
  disc: '전시회 일정은 주최 측 사정으로 바뀔 수 있으니 참가·출장을 확정하기 전에 반드시 주최 측 공식 사이트에서 다시 확인하세요. 자동 수집 항목은 일정과 장소만 표시합니다.',
  info: (p, n) => `${n}쪽 중 ${p}쪽`, allTitle: '전 세계 전시회 개최 국가 — 국가별 무역박람회 일정 | CBM Lab', allDesc: n => `전시회가 열리는 ${n}개 나라를 대륙별로 모았습니다. 나라를 누르면 그 나라의 무역박람회 일정을 볼 수 있습니다.`,
  contTitle: n => `${n} 전시회 일정 — 국가별 무역박람회 캘린더 | CBM Lab`, contDesc: (n, k) => `${n}에서 열리는 전시회 일정 ${k}건. 국가와 품목별로 기간과 개최 도시를 확인하세요.`,
  srcTitle: n => `${n} — 전시회 일정 모음 | CBM Lab`, srcDesc: (n, k) => `${n}에서 확인한 전시회 일정 ${k}건. 기간과 개최 도시를 정리했습니다.`, srcH: '확인한 곳' });
Object.assign(T.en, { continent: 'Region', continents: 'By region', allC: 'All countries', countries: 'By country', allCountries: 'All countries', srcs: 'Schedule sources', perPage: 'Per page', prev: 'Prev', next: 'Next', loading: 'Loading…', pages: 'Pagination', home: 'Trade Fairs Worldwide',
  disc: 'Dates can change at the organizer\'s discretion, so always re-check the organizer\'s official site before booking travel or booths. Automatically collected entries show dates and venue only.',
  info: (p, n) => `Page ${p} of ${n}`, allTitle: 'Trade Fairs by Country — Every Country We Cover | CBM Lab', allDesc: n => `Trade fairs in ${n} countries, grouped by region. Open a country to see its upcoming dates.`,
  contTitle: n => `Trade Fairs in ${n} — Upcoming Dates by Country | CBM Lab`, contDesc: (n, k) => `${k} upcoming trade fairs in ${n}. Check dates and host cities by country and industry.`,
  srcTitle: n => `${n} — Trade Fair Dates | CBM Lab`, srcDesc: (n, k) => `${k} trade fair dates checked via ${n}, with dates and host cities.`, srcH: 'Where we checked' });

const PAGE = 20;
const hotOf = (f, t) => f.status === 'upcoming' && daysTo(f) <= 30 ? t.ddays(daysTo(f)) : f.status === 'ongoing' ? t.ddays(-1) : '';
const place = (f, L) => (L === 'ko' ? f.ck : f.c) + (CTRY[f.cc] ? ', ' + CTRY[f.cc][L === 'ko' ? 0 : 1] : '');
const alt = (f, L) => f.n + (f.img?.venue ? (L === 'ko' ? ' 개최지 전시장' : ' venue') : '');
const rec = (f, t) => { const L = t.lang, d = t.fmt(f.s, f.e).split(' – '); return { h: f.slug, n: f.n, pl: place(f, L), g: f.g, gl: gLabel(f.g, L), c: f.cc, k: f.k, ci: slugify(f.c), vn: f.vn || '', sr: f.sr, s: f.s, e: f.e, d1: d[0], d2: f.s !== f.e ? '~ ' + (d[1] || '') : '', hl: hotOf(f, t), th: f.img ? imgUrl(f.img, 240) : '', al: alt(f, L), q: `${f.n} ${f.c} ${f.ck} ${CTRY[f.cc]?.[0] || ''} ${CTRY[f.cc]?.[1] || ''}`.toLowerCase() }; };
const CLIENT_JS = String.raw`(function(){var CFG=__CFG__,$=function(i){return document.getElementById(i)},q=$('q');if(!q)return;
var list=$('list'),cnt=$('fcnt'),pager=$('pager'),pinfo=$('pinfo'),orig=list.innerHTML,DATA=null,page=1,size=20,T=CFG.T;
var T0=new Date(Date.now()+9*36e5).toISOString().slice(0,10),T30=new Date(Date.now()+9*36e5+30*864e5).toISOString().slice(0,10);
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(m){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]})}
function inScope(r){var p=CFG.SCOPE;if(!p)return true;var i=p.indexOf(':'),k=p.slice(0,i),v=p.slice(i+1);return k==='g'?r.g===v:k==='c'?r.c===v:k==='k'?r.k===v:k==='m'?r.s.slice(0,7)===v:k==='y'?r.ci===v:k==='v'?r.vn===v:k==='n'?r.s.slice(0,4)===v:r.sr===v}
function card(r){var en=r.e<T0;return '<article class="item'+(r.th?' hasimg':'')+(en?' past':'')+'" style="--c:'+(CFG.COL[r.g]||'#6b7780')+'"><div class="dt"><b>'+esc(r.d1)+'</b>'+esc(r.d2)+'</div><div><a class="t" href="'+CFG.UP+'f/'+r.h+'.html">'+esc(r.n)+'</a><p>'+esc(r.pl)+' · '+esc(r.gl)+'</p>'+(r.hl&&!en?'<span class="tag hot">'+esc(r.hl)+'</span>':'')+'</div>'+(r.th?'<img class="th" loading="lazy" width="120" height="80" src="'+esc(r.th)+'" alt="'+esc(r.al)+'">':'')+'</article>'}
function pg(n){var pages=Math.max(1,Math.ceil(n/size)),h='',i,set=[1,pages,page-1,page,page+1],last=0;pinfo.textContent=pages>1?T.info.replace('{p}',page).replace('{n}',pages):'';if(pages<2){pager.innerHTML='';return}
h+='<button type="button" data-p="'+(page-1)+'"'+(page<2?' disabled':'')+'>'+T.prev+'</button>';
set=set.filter(function(x,k){return x>=1&&x<=pages&&set.indexOf(x)===k}).sort(function(a,b){return a-b});
for(i=0;i<set.length;i++){if(set[i]-last>1)h+='<span class="gap">…</span>';h+='<button type="button" data-p="'+set[i]+'"'+(set[i]===page?' class="cur" aria-current="page"':'')+'>'+set[i]+'</button>';last=set[i]}
h+='<button type="button" data-p="'+(page+1)+'"'+(page>=pages?' disabled':'')+'>'+T.next+'</button>';pager.innerHTML=h}
function val(i){return $(i)?$(i).value:''}
function render(){var s=q.value.toLowerCase().trim(),c=val('fc'),k=val('fr'),g=val('fg'),m=val('fm'),so=val('fs'),d1=val('fd1'),d2=val('fd2'),n30=$('f30')&&$('f30').checked,en=$('fend')&&$('fend').checked;
var active=s||c||k||g||m||so||d1||d2||n30||en;
if(!active&&page===1&&size===PAGE){list.innerHTML=orig;cnt.textContent=CFG.TOTAL+' '+T.count;pg(CFG.TOTAL);return}
if(!DATA){cnt.textContent=T.loading;fetch(CFG.UP+'data.json').then(function(r){return r.json()}).then(function(j){DATA=j.filter(inScope);render()});return}
var res=DATA.filter(function(r){var ended=r.e<T0;return(en||!ended)&&(!s||r.q.indexOf(s)>-1)&&(!c||r.c===c)&&(!k||r.k===k)&&(!g||r.g===g)&&(!m||r.s.slice(0,7)===m||r.e.slice(0,7)===m)&&(!d1||r.e>=d1)&&(!d2||r.s<=d2)&&(!n30||(r.s>=T0&&r.s<=T30))});
res=so==='n'?res.sort(function(a,b){return a.n.localeCompare(b.n)}):res.filter(function(r){return r.e>=T0}).concat(res.filter(function(r){return r.e<T0}).reverse());
var pages=Math.max(1,Math.ceil(res.length/size));if(page>pages)page=pages;
list.innerHTML=res.length?res.slice((page-1)*size,page*size).map(card).join(''):'<p>'+T.none+'</p>';cnt.textContent=res.length.toLocaleString()+' '+T.count;pg(res.length)}
function reset(){page=1;render()}var tm;
q.addEventListener('input',function(){clearTimeout(tm);tm=setTimeout(reset,180)});
['fc','fr','fg','fm','fs','fd1','fd2','f30','fend'].forEach(function(i){if($(i))$(i).addEventListener('change',reset)});

function ymd(d){return d.toISOString().slice(0,10)}
function setR(r){var b=T0.split('-'),y=+b[0],mo=+b[1]-1,a,z;if(r==='m0'){a=new Date(Date.UTC(y,mo,1));z=new Date(Date.UTC(y,mo+1,0))}else if(r==='m1'){a=new Date(Date.UTC(y,mo+1,1));z=new Date(Date.UTC(y,mo+2,0))}else if(r==='d30'||r==='d90'){a=new Date(T0);z=new Date(Date.parse(T0)+(r==='d30'?30:90)*864e5)}
$('fd1').value=a?ymd(a):'';$('fd2').value=a?ymd(z):'';[].forEach.call(document.querySelectorAll('#qk button'),function(x){x.classList.toggle('on',x.dataset.r===r)});page=1;render()}
$('qk').addEventListener('click',function(e){var b=e.target.closest('button[data-r]');if(b)setR(b.dataset.r)});
['fd1','fd2'].forEach(function(i){$(i).addEventListener('input',function(){[].forEach.call(document.querySelectorAll('#qk button'),function(x){x.classList.remove('on')})})});
$('frs').addEventListener('click',function(){[].forEach.call(document.querySelectorAll('#qk button'),function(x){x.classList.toggle('on',!x.dataset.r)});['q','fc','fr','fg','fm','fs','fd1','fd2'].forEach(function(i){if($(i))$(i).value=''});if($('f30'))$('f30').checked=false;if($('fend'))$('fend').checked=false;reset()});
pager.addEventListener('click',function(e){var b=e.target.closest('button[data-p]');if(!b||b.disabled)return;page=+b.dataset.p;render();var bar=document.querySelector('.fb');window.scrollTo({top:bar.getBoundingClientRect().top+window.pageYOffset-8,behavior:'smooth'})});
q.addEventListener('focus',function(){if(!DATA){fetch(CFG.UP+'data.json').then(function(r){return r.json()}).then(function(j){DATA=j.filter(inScope)})}},{once:true});
cnt.textContent=CFG.TOTAL+' '+T.count;pg(CFG.TOTAL)})();`;
const contLabel = (k, L) => CONTS.find(c => c.k === k)[L];
const slugC = c => c.toLowerCase();
const ctryName = (cc, L) => CTRY[cc]?.[L === 'ko' ? 0 : 1] || cc;
const ctryList = keep.reduce((m, f) => (f.cc !== 'XX' && (m[f.cc] = (m[f.cc] || 0) + 1), m), {});
const cPages = Object.keys(ctryList).filter(c => ctryList[c] >= 2).sort((a, b) => ctryList[b] - ctryList[a]);
const srcUsed = Object.keys(SRC).filter(k => keep.some(f => f.sr === k));
const contUsed = CONTS.filter(c => keep.some(f => f.k === c.k));

for (const t of Object.values(T)) {
  const L = t.lang, active = keep.filter(f => f.status !== 'ended');
  const gUsed = GROUPS.filter(g => keep.some(f => f.g === g.k));
  const gName = g => g[L === 'ko' ? 'ko' : 'en'];
  const cnt = (fn) => keep.filter(f => f.status !== 'ended' && fn(f)).length;
  const months = [...new Set(keep.flatMap(f => [f.s.slice(0, 7), f.e.slice(0, 7)]))].sort();
  const tiles = (cur, up) => `<div class="tiles">${gUsed.map(g => `<a class="tile${cur === g.k ? ' on' : ''}" style="--c:${gColor[g.k]}" href="${up}c-${g.k}.html">${svg(g.icon)}<span>${esc(gName(g))}<small>${cnt(f => f.g === g.k)}</small></span></a>`).join('')}</div>`;
  const contChips = (cur, up) => `<div class="chips">${contUsed.map(c => `<a class="chip${cur === c.k ? ' on' : ''}" style="--c:${c.c}" href="${up}r-${c.k}.html">${esc(c[L])} <b>${cnt(f => f.k === c.k)}</b></a>`).join('')}</div>`;
  const ctryChips = (cur, up, home) => `<div class="chips">${cPages.slice(0, 16).map(c => `<a class="chip${cur === c ? ' on' : ''}" href="${home ? '' : up + 'country/'}${slugC(c)}.html">${esc(ctryName(c, L))} <b>${cnt(f => f.cc === c)}</b></a>`).join('')}<a class="chip all" href="${up}countries.html">${svg('language')}${t.allCountries}</a></div>`;
  const srcChips = (cur, up) => `<div class="chips">${srcUsed.map(k => `<a class="chip${cur === k ? ' on' : ''}" href="${up}${k}.html">${esc(SRC[k][L])} <b>${keep.filter(f => f.sr === k).length}</b></a>`).join('')}</div>`;
  const guideAt = up => `<section class="box"><h2>${t.guideH}</h2>${t.gdLong.map(([h, p]) => `<p><b>${esc(h)}.</b> ${md(p, up)}</p>`).join('')}</section>`;
  const credits = srcs => [...new Set(srcs)].map(k => SRC[k]?.cr[L]).filter(Boolean).join(' · ');
  const noteOf = arr => `<p class="note">${esc(t.disc)}<br>${esc(credits(arr.map(f => f.sr)))}<br>${t.verify}: ${VERIFIED}</p>`;
  const controls = () => `<div class="fb"><div class="sf">${svg('search')}<input id="q" type="search" placeholder="${t.search}" aria-label="${t.search}"></div><div class="qk" id="qk" role="group" aria-label="${t.quick}">${[['', t.all], ['m0', t.thisM], ['m1', t.nextM], ['d30', t.in30], ['d90', t.in90]].map(([k, v], i) => `<button type="button" data-r="${k}"${i ? '' : ' class="on"'}>${v}</button>`).join('')}<button type="button" id="frs" class="rs">${t.reset}</button></div><div class="fr"><select id="fc" aria-label="${t.byC}"><option value="">${t.allC}</option>${Object.keys(ctryList).sort((a, b) => ctryName(a, L).localeCompare(ctryName(b, L), L)).map(c => `<option value="${c}">${esc(ctryName(c, L))}</option>`).join('')}</select><select id="fr" aria-label="${t.continent}"><option value="">${t.continent}: ${t.all}</option>${contUsed.map(c => `<option value="${c.k}">${esc(c[L])}</option>`).join('')}</select><select id="fg" aria-label="${t.field}"><option value="">${t.field}: ${t.all}</option>${gUsed.map(g => `<option value="${g.k}">${esc(gName(g))}</option>`).join('')}</select><select id="fm" aria-label="${t.mon}"><option value="">${t.mon}: ${t.all}</option>${months.map(m => `<option value="${m}">${esc(monLabel(m))}</option>`).join('')}</select><select id="fs" aria-label="${t.sort}"><option value="">${t.sort}: ${t.byDate}</option><option value="n">${t.sort}: ${t.byName}</option></select></div><details class="adv"><summary>${t.adv}</summary><div class="fr"><label>${t.from}<input id="fd1" type="date"></label><label>${t.to}<input id="fd2" type="date"></label><label class="ck"><input id="f30" type="checkbox"> ${t.l2}</label><label class="ck"><input id="fend" type="checkbox"> ${t.inclEnded}</label></div></details><p class="fcnt" id="fcnt" aria-live="polite"></p></div>`;
  const addD = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
  const WD = L === 'ko' ? ['일', '월', '화', '수', '목', '금', '토'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const wd = d => WD[new Date(d + 'T00:00:00Z').getUTCDay()];
  const dayCount = f => Math.round((Date.parse(f.e) - Date.parse(f.s)) / 864e5) + 1;
  const comply = (g, up) => { const c = COMPLY[g]?.[L]; if (!c) return ''; return `<section class="box"><h2>${L === 'ko' ? '수입 전에 확인할 국내 규정과 기관' : 'Korean import rules to check first'}</h2><p>${esc(c[0])}</p><p>${L === 'ko' ? '공식 안내' : 'Official sources'}: ${c[1].map(([n, u]) => `<a href="${u}" rel="noopener nofollow" target="_blank">${esc(n)}</a>`).join(' · ')} · <a href="${FTA_LINK[0]}" rel="noopener nofollow" target="_blank">${L === 'ko' ? FTA_LINK[1] : FTA_LINK[2]}</a></p><p class="note">${L === 'ko' ? '요건은 HS 코드와 품목 상세에 따라 달라집니다. 거래 전 해당 기관에서 최신 기준을 확인하세요.' : 'Requirements vary by HS code and product detail; confirm the latest rules with the agency before you trade.'}</p></section>`; };
  const timeline = f => {
    const st = f.status === 'ended' ? [] : [[-56, L === 'ko' ? '참가업체 목록 확인, 만날 업체 5~10곳 선정' : 'Get the exhibitor list and shortlist 5–10 suppliers'], [-42, L === 'ko' ? '미팅 요청 메일 발송(전시 기간 내 시간대 제안)' : 'Send meeting requests with proposed time slots'], [-28, L === 'ko' ? '항공·숙소 예약 확정, 사전 등록(필요 시)' : 'Book flights and hotel; complete pre-registration if required'], [-14, L === 'ko' ? '수입 요건·인증 확인, 질문 양식과 견적 비교표 준비' : 'Check import requirements; prepare question sheet and quote template'], [0, L === 'ko' ? '개막' : 'Opening day'], [dayCount(f) - 1, L === 'ko' ? '폐막(핵심 업체 재방문은 중간 일정에)' : 'Closing day (revisit key suppliers mid-fair)'], [dayCount(f) + 6, L === 'ko' ? '감사 메일과 견적·샘플 요청 발송' : 'Send thank-you notes with quote and sample requests'], [dayCount(f) + 20, L === 'ko' ? '견적을 착지원가로 환산해 비교 마감' : 'Finish landed-cost comparison of quotes']]
      .map(([n, x]) => [addD(f.s, n), x]).filter(([d]) => d >= today);
    if (!st.length) return '';
    return `<section class="box"><h2>${L === 'ko' ? '이 전시회 기준 준비 일정' : 'Preparation timeline for this fair'}</h2><ol class="tlst">${st.map(([d, x]) => `<li><b>${esc(t.fmt(d, d))} (${wd(d)})</b> ${esc(x)}</li>`).join('')}</ol></section>`;
  };
  const facts = f => {
    const n = dayCount(f), wk = [...Array(n)].some((_, i) => [0, 6].includes(new Date(addD(f.s, i) + 'T00:00:00Z').getUTCDay()));
    const a = L === 'ko' ? `개막일은 ${wd(f.s)}요일이며 ${n}일간 열립니다. ${wk ? '주말이 포함되어 있어 항공·숙박 요금이 오를 수 있고, 일부 업체는 주말 상담을 제한할 수 있습니다.' : '평일에만 열려 업체 상담에 집중하기 좋은 일정입니다.'}` : `It opens on a ${wd(f.s)} and runs ${n} day${n > 1 ? 's' : ''}. ${wk ? 'The run includes a weekend, so flights and hotels may cost more and some suppliers limit weekend meetings.' : 'It runs on weekdays only, which suits supplier meetings.'}`;
    return `<p>${esc(a)}</p>`;
  };
  const together = (f, up) => {
    const near = keep.filter(x => x.slug !== f.slug && x.status !== 'ended' && Math.abs(Date.parse(x.s) - Date.parse(f.s)) <= 10 * 864e5 && (x.c === f.c || x.cc === f.cc)).slice(0, 5);
    if (!near.length) return '';
    return `<section class="box"><h2>${L === 'ko' ? '같은 출장에서 함께 볼 전시회' : 'Fairs to combine on one trip'}</h2><p>${L === 'ko' ? '개막일이 10일 이내이면서 같은 도시 또는 같은 나라에서 열립니다.' : 'Opening within 10 days of this fair in the same city or country.'}</p>${near.map(x => row(x, t, up)).join('')}</section>`;
  };
  // fair visitor guide page
  { const G = GUIDE[L], url = `${BASE}/${t.dir}/guide.html`;
    const ld = { '@context': 'https://schema.org', '@graph': [{ '@type': 'Article', headline: G.h1, description: G.desc, inLanguage: L, dateModified: today, author: { '@type': 'Organization', name: 'CBM Lab' }, mainEntityOfPage: url }, { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: t.h1, item: `${BASE}/${t.dir}/index.html` }, { '@type': 'ListItem', position: 2, name: G.h1 }] }] };
    const body = `${G.sec.map(([h, ps]) => `<section class="box"><h2>${esc(h)}</h2>${ps.map(x => `<p>${esc(x)}</p>`).join('')}</section>`).join('')}<section class="box"><h2>${L === 'ko' ? '참고한 공식 자료' : 'References'}</h2><ul>${G.refs.map(([n, u]) => `<li><a href="${u}" rel="noopener nofollow" target="_blank">${esc(n)}</a></li>`).join('')}</ul></section><section class="box"><h2>${L === 'ko' ? '함께 쓰는 도구' : 'Related tools'}</h2><div class="tl">${t.tools.map(([h, n]) => `<a href="${L === 'ko' ? '../' : '../../'}${h}">${esc(n)}</a>`).join('')}</div></section><p style="margin:16px 0"><a class="gl2" href="index.html">${L === 'ko' ? '전시회 일정 보러 가기' : 'Browse the trade fair calendar'}</a></p>`;
    write(t, 'guide.html', layout(t, { path: 'guide.html', title: G.title + ' — CBM Lab', desc: G.desc, ld, up: '', alt: '', hero: heroHtml(t, G.h1, G.desc, '', 'index.html'), body })); }
  const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const actYears = [...new Set(active.map(f => f.s.slice(0, 4)))].sort(), YR = (() => { const c = {}; for (const f of active) c[f.s.slice(0, 4)] = (c[f.s.slice(0, 4)] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || today.slice(0, 4); })();   // year with the most upcoming fairs (what people search for)
  const mUsed = [...new Set(active.map(f => f.s.slice(0, 7)))].sort();
  const monLabel = m => L === 'ko' ? `${m.slice(0, 4)}년 ${+m.slice(5)}월` : `${MN[+m.slice(5) - 1]} ${m.slice(0, 4)}`;
  const cityCount = active.reduce((o, f) => (o[f.c] = (o[f.c] || 0) + 1, o), {});
  const cityList = Object.keys(cityCount).filter(c => cityCount[c] >= 2).sort((a, b) => cityCount[b] - cityCount[a]);
  const top = (arr, fn, n) => { const m = {}; arr.forEach(f => { const k = fn(f); if (k) m[k] = (m[k] || 0) + 1; }); return Object.keys(m).sort((a, b) => m[b] - m[a]).slice(0, n); };
  const monChips = up => `<div class="chips">${mUsed.slice(0, 18).map(m => `<a class="chip" href="${up}m-${m}.html">${esc(monLabel(m))} <b>${active.filter(f => f.s.startsWith(m)).length}</b></a>`).join('')}</div>`;
  const cityChips = up => `<div class="chips">${cityList.slice(0, 18).map(c => { const f = keep.find(x => x.c === c); return `<a class="chip" href="${up}city/${slugify(c)}.html">${esc(L === 'ko' ? f.ck : c)} <b>${cityCount[c]}</b></a>`; }).join('')}</div>`;
  // data-driven intro + FAQ (facts come from the list itself, so every page differs)
  function auto(o, arr) {
    const act = arr.filter(f => f.status !== 'ended').sort((a, b) => a.s.localeCompare(b.s)), n = act.length, nx = act[0];
    if (!n || o.kind === 'sr') return { html: '', faq: [] };
    const nm = o.kind === 'index' ? (L === 'ko' ? t.h1 : 'upcoming trade fairs') : o.name, gT = top(act, f => gLabel(f.g, L), 3), cT = top(act, f => L === 'ko' ? f.ck : f.c, 3), kT = top(act, f => ctryName(f.cc, L), 3);
    const nxs = `${nx.n} (${t.fmt(nx.s, nx.e)}, ${place(nx, L)})`;
    const a1 = L === 'ko' ? `${nm}: 현재 예정·진행 중인 일정이 ${n}건입니다. 가장 가까운 일정은 ${nxs}입니다.` : `${nm}: ${n} upcoming or ongoing fairs are listed. The nearest is ${nxs}.`;
    const a2 = L === 'ko' ? `분야는 ${gT.join(', ')} 순으로 많고, 개최지는 ${(o.kind === 'c' ? cT : kT.length > 1 ? kT : cT).join(', ')} 중심입니다.` : `The most common industries are ${gT.join(', ')}, with fairs concentrated in ${(o.kind === 'c' ? cT : kT.length > 1 ? kT : cT).join(', ')}.`;
    const a3 = L === 'ko' ? `일정은 정부·대사관·주최 측·전시장이 공개한 자료를 기준으로 하며 최종 확인일은 ${VERIFIED}입니다. 부스 계약이나 출장 확정 전에는 주최 측 공식 사이트에서 날짜를 다시 확인하세요.` : `Dates follow public calendars from governments, embassies, organizers and venues; last checked ${VERIFIED}. Re-check the organizer's official site before booking a booth or travel.`;
    const faq = L === 'ko' ? [[`${nm} 일정은 언제인가요?`, `${a1}`], [`${nm}에는 어떤 분야가 많나요?`, a2], [`전시회 일정은 어디서 확인한 건가요?`, a3], [`해외 전시회 방문 전에 무엇을 준비하나요?`, t.prep(nx).slice(0, 3).join(' ')]] : [[`When are ${nm}?`, a1], [`Which industries are covered in ${nm}?`, a2], [`Where do these trade fair dates come from?`, a3], [`How should I prepare before visiting an overseas trade fair?`, t.prep(nx).slice(0, 3).join(' ')]];
    const html = `<section class="intro"><p>${esc(a1)} ${esc(a2)}</p><p>${esc(a3)}</p></section>`;
    return { html, faq, faqHtml: `<section class="box"><h2>${L === 'ko' ? '자주 묻는 질문' : 'FAQ'}</h2>${faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')}</section>`, faqLd: { '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) } };
  }
  // generic list page: o = {kind, key, arr, slug, title, desc, name, up, intro}
  function page(o) {
    const arr = o.arr, act = arr.filter(f => f.status !== 'ended'), up = o.up, shown = act.slice(0, PAGE);
    const scope = o.kind === 'index' ? '' : `${o.kind}:${o.key}`;
    const A = auto(o, arr), ld0 = { '@type': 'CollectionPage', name: o.title, description: o.desc, url: `${BASE}/${t.dir}/${o.slug}.html`, inLanguage: L, dateModified: today, mainEntity: itemList(arr, t, up) };
    const ld = { '@context': 'https://schema.org', '@graph': A.faqLd ? [ld0, A.faqLd] : [ld0] };
    const stats = o.kind === 'index' ? `<div class="stats"><div class="stat"><b>${act.length}</b><span>${t.l1}</span></div><div class="stat"><b>${act.filter(f => f.status === 'upcoming' && daysTo(f) <= 30).length}</b><span>${t.l2}</span></div><div class="stat"><b>${Object.keys(ctryList).length}</b><span>${t.l4}</span></div><div class="stat"><b>${srcUsed.length}</b><span>${L === 'ko' ? '일정 출처' : 'Sources'}</span></div></div>` : '';
    const hero = `<div class="hero"><div class="in">${o.kind !== 'index' ? `<a class="crumb" href="${up}index.html">← ${esc(t.h1)}</a>` : ''}<h1>${esc(o.kind === 'index' ? t.h1 : o.h1 || o.name)}</h1><p>${esc(o.kind === 'index' ? t.sub : o.desc)}</p>${stats}</div></div>`;
    const cfg = { UP: up, SCOPE: scope, TOTAL: act.length, COL: gColor, T: { count: t.count, none: t.none, loading: t.loading, prev: t.prev, next: t.next, info: t.info('{p}', '{n}') } };
    const body = `${o.intro || ''}${controls()}<div id="list">${shown.map(f => row(f, t, up)).join('') || `<p>${t.none}</p>`}</div><nav class="pager" id="pager" aria-label="${t.pages}"></nav><p class="pinfo" id="pinfo"></p>${A.html}`
      + `<h2 class="sh">${t.byG}</h2>${tiles(o.kind === 'g' ? o.key : '', up)}<h2 class="sh">${t.continents}</h2>${contChips(o.kind === 'k' ? o.key : '', up)}<h2 class="sh">${t.countries}</h2>${ctryChips(o.kind === 'c' ? o.key : '', up, o.kind === 'c')}<h2 class="sh">${L === 'ko' ? '개최월별' : 'By month'}</h2>${monChips(up)}<h2 class="sh">${L === 'ko' ? '도시별' : 'By city'}</h2>${cityChips(up)}<h2 class="sh">${t.srcs}</h2>${srcChips(o.kind === 'sr' ? o.key : '', up)}${o.kind === 'index' ? guideAt('') + `<p style="margin:14px 0"><a class="gl2" href="guide.html">${L === 'ko' ? '전시회 참관·상담 가이드 전체 보기' : 'Read the full visitor guide'}</a></p>` : ''}${A.faqHtml || ''}${noteOf(arr)}`
      + `<script>${CLIENT_JS.replace('__CFG__', () => JSON.stringify(cfg)).replace('PAGE', () => String(PAGE))}</script>`;
    write(t, `${o.slug}.html`, layout(t, { path: `${o.slug}.html`, title: o.title, desc: o.desc, ld, up, alt: '', hero, body }));
  }
  const yearArr = keep.filter(f => f.s.startsWith(YR));
  page({ kind: 'index', slug: 'index', arr: keep, up: '', intro: yearArr.length >= 20 ? `<section class="box"><h2>${L === 'ko' ? `${YR} 전시회 일정 총정리` : `${YR} trade fair calendar`}</h2><p><a class="chip" href="year-${YR}.html">${L === 'ko' ? `${YR}년 전시회 ${yearArr.length}건 월별로 보기 →` : `Browse ${yearArr.length} fairs of ${YR} by month →`}</a></p></section>` : '', title: L === 'ko' ? `${YR} 세계 전시회 일정 | 해외 박람회·무역박람회 캘린더 — CBM Lab` : `Trade Fairs ${YR} — Worldwide Trade Show Calendar by Industry | CBM Lab`, desc: t.sub });
  for (const g of gUsed) { const arr = keep.filter(f => f.g === g.k), name = gName(g); page({ kind: 'g', key: g.k, slug: `c-${g.k}`, arr, up: '', name: t.gd(name), title: L === 'ko' ? `${name} 전시회 일정 ${YR} | 해외 ${name} 박람회 캘린더 — CBM Lab` : `${name} Trade Fairs ${YR} — Dates & Cities | CBM Lab`, desc: t.gdesc(name, arr.filter(f => f.status !== 'ended').length), intro: `<section class="intro"><h2>${esc(name)}</h2><p>${esc(gIntro(g.k, L))}</p></section>${comply(g.k, '')}` }); }
  for (const c of contUsed) { const arr = keep.filter(f => f.k === c.k); page({ kind: 'k', key: c.k, slug: `r-${c.k}`, arr, up: '', name: c[L] + (L === 'ko' ? ' 전시회' : ' trade fairs'), title: t.contTitle(c[L]), desc: t.contDesc(c[L], arr.filter(f => f.status !== 'ended').length) }); }
  for (const k of srcUsed) { const arr = keep.filter(f => f.sr === k); page({ kind: 'sr', key: k, slug: k, arr, up: '', name: SRC[k][L], title: t.srcTitle(SRC[k][L]), desc: t.srcDesc(SRC[k][L], arr.filter(f => f.status !== 'ended').length) }); }
  // data-derived country brief (unique per country, computed from the collected schedule)
  const countryBrief = (c, arr, name) => {
    const up = arr.filter(f => f.status !== 'ended'); if (up.length < 2) return '';
    const top = (key, lab) => Object.entries(arr.reduce((m, f) => (m[key(f)] = (m[key(f)] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => lab(k, v));
    const cities = top(f => L === 'ko' ? f.ck : f.c, (k, v) => `${k}(${v})`);
    const gs = top(f => f.g, (k, v) => { const g = GROUPS.find(x => x.k === k); return `${g ? gName(g) : k}(${v})`; });
    const mon = Object.entries(arr.reduce((m, f) => (m[+f.s.slice(5, 7)] = (m[+f.s.slice(5, 7)] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1])[0];
    const avg = Math.round(arr.reduce((a, f) => a + dayCount(f), 0) / arr.length * 10) / 10;
    const nxt = up.slice().sort((a, b) => a.s.localeCompare(b.s))[0];
    const p = L === 'ko'
      ? `${name}에서는 현재 ${arr.length}건의 전시회가 정리되어 있고, 이 중 ${up.length}건이 개최 예정이거나 진행 중입니다. 개최 도시는 ${cities.join(', ')} 순으로 많고, 분야는 ${gs.join(', ')} 순입니다. 개막 월은 ${mon[0]}월(${mon[1]}건)에 가장 몰려 있으며, 평균 개최 기간은 ${avg}일입니다. 가장 가까운 일정은 ${t.fmt(nxt.s, nxt.e)}에 ${nxt.ck || nxt.c}에서 열리는 「${nxt.n}」입니다.`
      : `We currently track ${arr.length} trade fairs in ${name}, of which ${up.length} are upcoming or running. The busiest host cities are ${cities.join(', ')}, and the most common industries are ${gs.join(', ')}. Openings cluster in ${MN[mon[0] - 1]} (${mon[1]} fairs), and a fair lasts ${avg} days on average. The next one is "${nxt.n}" in ${nxt.c}, ${t.fmt(nxt.s, nxt.e)}.`;
    const byM = Object.entries(up.reduce((m, f) => (m[f.s.slice(0, 7)] = (m[f.s.slice(0, 7)] || 0) + 1, m), {})).sort();
    const monP = up.length >= 5 && byM.length >= 2 ? (L === 'ko' ? `월별 개막 건수는 ${byM.map(([m, v]) => `${m.slice(0, 4)}년 ${+m.slice(5)}월 ${v}건`).join(', ')}입니다.` : `Openings by month: ${byM.map(([m, v]) => `${MN[+m.slice(5) - 1]} ${m.slice(0, 4)} ${v}`).join(', ')}.`) : '';
    const q = L === 'ko' ? `일정은 주최 측 사정으로 바뀔 수 있으니 방문 전 공식 사이트에서 개막일과 장소를 다시 확인하세요. 수치는 이 사이트에 모인 일정을 기준으로 매일 다시 계산됩니다.` : `Dates can change at the organizer's discretion, so confirm the opening date and venue on the official site before you travel. Figures are recalculated daily from the schedule collected here.`;
    return `<section class="box"><h2>${L === 'ko' ? `${name} 전시회 한눈에 보기` : `${name} trade fairs at a glance`}</h2><p>${esc(p)}</p>${monP ? `<p>${esc(monP)}</p>` : ''}<p class="note">${esc(q)}</p>${c === 'CN' && L === 'ko' ? '<p><a href="/guides/canton-fair.html">캔톤페어 일정·기수별 품목 보기 →</a></p>' : ''}${c === 'KR' && !/\/venue\//.test(name) ? `<h3>${L === 'ko' ? '전시장별 일정' : 'By venue'}</h3>${venueChips('../')}` : ''}</section>`;
  };
  // year hub: "2027 전시회 일정 총정리" (targets year + 일정 searches)
  const yearHref = up => `${up}year-${YR}.html`;
  if (yearArr.length >= 20) {
    const ym = mUsed.filter(m => m.startsWith(YR)), cn = {}; for (const f of yearArr) cn[f.cc] = (cn[f.cc] || 0) + 1;
    const topC = Object.entries(cn).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, v]) => `${ctryName(c, L)}(${v})`).join(', ');
    const monLinks = ym.map(m => `<a class="chip" href="m-${m}.html">${L === 'ko' ? +m.slice(5) + '월' : MN[+m.slice(5) - 1].slice(0, 3)} <b>${keep.filter(f => f.s.startsWith(m)).length}</b></a>`).join('');
    const intro = `<section class="box"><h2>${L === 'ko' ? `${YR}년 전시회 일정 한눈에 보기` : `${YR} trade fair calendar at a glance`}</h2><p>${esc(L === 'ko' ? `${YR}년에 개막하는 전시회·박람회 ${yearArr.length}건을 모았습니다. 개최가 많은 나라는 ${topC} 순입니다. 월을 눌러 그 달에 열리는 전시회만 볼 수 있고, 국내 일정은 전시장별 페이지에서 확인할 수 있습니다.` : `We list ${yearArr.length} trade fairs opening in ${YR}. The countries with the most are ${topC}. Pick a month to see only that month, or open a country or venue page for more.`)}</p><div class="chips">${monLinks}</div></section>`;
    page({ kind: 'n', key: YR, slug: `year-${YR}`, arr: yearArr, up: '', intro, name: L === 'ko' ? `${YR} 전시회 일정 총정리` : `${YR} trade fair calendar`,
      title: L === 'ko' ? `${YR} 전시회 일정 총정리 | 월별·국가별 박람회 일정 ${yearArr.length}건 — CBM Lab` : `${YR} Trade Fair Calendar — ${yearArr.length} Shows by Month and Country | CBM Lab`,
      desc: L === 'ko' ? `${YR}년 전시회·박람회 일정 ${yearArr.length}건을 월별·국가별로 정리했습니다. 개최일과 도시를 확인하고 출장 일정을 짜 보세요. 공식 일정 기준으로 매일 갱신합니다.` : `${yearArr.length} trade fairs opening in ${YR}, grouped by month and country with dates and host cities. Updated daily from official schedules.` });
  }
  // venue landing pages (domestic exhibition centres) - target "코엑스 전시회 일정" style searches
  const VENUES = { coex: ['코엑스', 'COEX', 'Seoul'], kintex: ['킨텍스', 'KINTEX', 'Goyang'], setec: ['세텍(SETEC)', 'SETEC', 'Seoul'], exco: ['엑스코(EXCO)', 'EXCO', 'Daegu'], ceco: ['창원컨벤션센터(CECO)', 'CECO', 'Changwon'] };
  const venueUsed = Object.keys(VENUES).filter(v => keep.filter(f => f.vn === v).length >= 3);
  const venueChips = up => venueUsed.length ? `<div class="chips">${venueUsed.map(v => `<a class="chip" href="${up}venue/${v}.html">${esc(L === 'ko' ? VENUES[v][0] : VENUES[v][1])} <b>${keep.filter(f => f.vn === v && f.status !== 'ended').length}</b></a>`).join('')}</div>` : '';
  for (const v of venueUsed) {
    const arr = keep.filter(f => f.vn === v), nm = L === 'ko' ? VENUES[v][0] : VENUES[v][1], k = arr.filter(f => f.status !== 'ended').length;
    page({ kind: 'v', key: v, slug: `venue/${v}`, arr, up: '../', name: nm + (L === 'ko' ? ' 전시회 일정' : ' exhibition schedule'),
      title: L === 'ko' ? `${nm} 전시회 일정 ${YR} | ${nm} 박람회·행사 캘린더 ${k}건 — CBM Lab` : `${nm} Exhibition Schedule ${YR} — ${k} Upcoming Trade Shows | CBM Lab`,
      desc: L === 'ko' ? `${nm}에서 열리는 전시회·박람회 ${k}건의 개최 일정을 날짜순으로 정리했습니다. 전시장 공식 사이트의 공개 일정을 기준으로 매일 갱신합니다.` : `${k} upcoming trade shows and expos at ${nm}, listed by date from the venue's own public calendar and updated daily.`,
      intro: countryBrief('KR', arr, nm) });
  }
  for (const c of cPages) { const arr = keep.filter(f => f.cc === c), name = ctryName(c, L); page({ kind: 'c', key: c, slug: `country/${slugC(c)}`, arr, up: '../', intro: countryBrief(c, arr, name), name: name + (L === 'ko' ? ' 전시회' : ' trade fairs'), title: L === 'ko' ? (c === 'KR' ? `국내 전시회 일정 ${YR} | 코엑스·킨텍스·세텍 박람회 캘린더 — CBM Lab` : `${name} 전시회 일정 ${YR} | ${name} 박람회·무역박람회 캘린더 — CBM Lab`) : `Trade Fairs in ${name} ${YR} — Upcoming Dates & Cities | CBM Lab`, desc: t.cdesc(name, arr.filter(f => f.status !== 'ended').length) }); }
  for (const m of mUsed) { const arr = keep.filter(f => f.s.startsWith(m)), nm = monLabel(m), k = arr.filter(f => f.status !== 'ended').length; page({ kind: 'm', key: m, slug: `m-${m}`, arr, up: '', name: L === 'ko' ? `${nm} 해외 전시회` : `Trade fairs in ${nm}`, title: L === 'ko' ? `${nm} 해외 전시회 일정 | ${+m.slice(5)}월 개최 박람회 ${k}건 — CBM Lab` : `Trade Fairs in ${nm} — ${k} Shows, Dates & Cities | CBM Lab`, desc: L === 'ko' ? `${nm}에 개막하는 해외 전시회 ${k}건. 개최 도시·분야·기간을 한눈에 보고 출장·소싱 일정을 잡아 보세요.` : `${k} trade fairs opening in ${nm}. Compare cities, industries and dates to plan sourcing trips.` }); }
  for (const c of cityList) { const arr = keep.filter(f => f.c === c), f0 = arr[0], nm = L === 'ko' ? f0.ck : c, k = cityCount[c]; page({ kind: 'y', key: slugify(c), slug: `city/${slugify(c)}`, arr, up: '../', name: L === 'ko' ? `${nm} 전시회` : `Trade fairs in ${nm}`, title: L === 'ko' ? `${nm} 전시회 일정 ${YR} | ${nm} 박람회·전시장 캘린더 — CBM Lab` : `Trade Fairs in ${nm} ${YR} — Exhibition Calendar & Dates | CBM Lab`, desc: L === 'ko' ? `${nm}에서 열리는 전시회 ${k}건. 개최 기간과 분야, 방문 전 체크리스트를 정리했습니다.` : `${k} trade fairs in ${nm} with dates, industries and a pre-visit checklist.` }); }
  // all countries
  { const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: t.allTitle, description: t.allDesc(cPages.length), url: `${BASE}/${t.dir}/countries.html`, inLanguage: L, dateModified: today };
    const body = `<h2 class="sh">${t.countries} (${cPages.length})</h2>${contUsed.map(c => { const cs = cPages.filter(x => CC_CONT[x] === c.k).sort((a, b) => ctryName(a, L).localeCompare(ctryName(b, L), L)); return cs.length ? `<h3 class="fam" style="--c:${c.c}"><a href="r-${c.k}.html">${esc(c[L])}</a></h3><div class="chips">${cs.map(x => `<a class="chip" style="--c:${c.c}" href="country/${slugC(x)}.html">${esc(ctryName(x, L))} <b>${cnt(f => f.cc === x)}</b></a>`).join('')}</div>` : ''; }).join('')}<h2 class="sh">${t.byG}</h2>${tiles('', '')}${noteOf(keep)}`;
    write(t, 'countries.html', layout(t, { path: 'countries.html', title: t.allTitle, desc: t.allDesc(cPages.length), ld, up: '', alt: '', hero: heroHtml(t, t.allCountries, t.allDesc(cPages.length), '', 'index.html'), body })); }
  // compact searchable dataset (all fairs, incl. recently ended)
  fs.writeFileSync(`${t.dir}/data.json`, JSON.stringify(keep.map(f => rec(f, t))));
  const note = noteOf(keep);
  // detail
  for (const f of keep) {
    const g = GROUPS.find(x => x.k === f.g), name = g[L === 'ko' ? 'ko' : 'en'], cn = CTRY[f.cc]?.[L === 'ko' ? 0 : 1], place = L === 'ko' ? f.ck : f.c;
    const nm = f.n.includes(f.s.slice(0, 4)) ? f.n : `${f.n} ${f.s.slice(0, 4)}`;
    const title = L === 'ko' ? `${nm} 일정·장소·참관 준비 | ${place} ${name} 전시회 — CBM Lab` : `${nm} — Dates, Venue & Visit Planning (${place}) | CBM Lab`;
    const desc = t.detailDesc(f).slice(0, 300);
    const related = arr => arr.filter(x => x.g === f.g && x.slug !== f.slug && x.status !== 'ended').slice(0, 6);
    const ld = { '@context': 'https://schema.org', '@graph': [eventLd(f, t), { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: t.h1, item: `${BASE}/${t.dir}/index.html` }, { '@type': 'ListItem', position: 2, name, item: `${BASE}/${t.dir}/c-${f.g}.html` }, { '@type': 'ListItem', position: 3, name: f.n }] }] };
    const status = f.status === 'ended' ? (L === 'ko' ? '이 전시회는 종료되었습니다. 다음 회차 일정은 주최 측 공식 사이트에서 확인하세요.' : 'This fair has ended. Check the organizer\'s official site for the next edition.') : f.status === 'ongoing' ? t.ddays(-1) : t.ddays(daysTo(f));
    const rel = related(keep);
    write(t, `f/${f.slug}.html`, layout(t, { path: `f/${f.slug}.html`, title, desc, ld, up: '../',
      hero: heroHtml(t, f.n, desc, '../', `../c-${f.g}.html`).replace(`← ${esc(t.h1)}`, `← ${esc(name)}`),
      body: `${f.img ? `<figure class="fig"><img src="${imgUrl(f.img, 960)}" width="960" height="540" alt="${esc(f.n + (f.img.venue ? (L === 'ko' ? ' 개최지 전시장' : ' venue') : ''))}"><figcaption>${f.img.venue ? (L === 'ko' ? '개최지 전시장 사진(해당 전시회 현장 사진이 아닙니다). ' : 'Photo of the host venue, not of this fair. ') : ''}${esc(L === 'ko' ? '사진' : 'Photo')}: ${esc(f.img.a)}, <a href="${imgPage(f.img)}" rel="noopener nofollow">${esc(f.img.lic)}</a>, Wikimedia Commons</figcaption></figure>` : ''}<section class="box"><dl class="kv"><dt>${t.dates}</dt><dd>${esc(t.fmt(f.s, f.e))}</dd><dt>${t.place}</dt><dd>${esc(place)}${cn ? ', ' + esc(cn) : ''}</dd><dt>${t.field}</dt><dd><a href="../c-${f.g}.html">${esc(name)}</a></dd><dt>${L === 'ko' ? '상태' : 'Status'}</dt><dd>${esc(status)}</dd>${f.u ? `<dt>${L === 'ko' ? '공식 사이트' : 'Official site'}</dt><dd><a href="${esc(f.u)}" rel="noopener nofollow" target="_blank">${esc(f.u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a></dd>` : ''}<dt>${L === 'ko' ? '일정 출처' : 'Schedule source'}</dt><dd>${esc(SRC[f.sr]?.[L] || '')}</dd><dt>${t.verify}</dt><dd>${VERIFIED}</dd></dl>${L === 'en' ? `<p>${esc(f.d)}.</p>` : `<p>${esc(gIntro(f.g, 'ko'))}</p>`}</section>
${f.status === 'ended' ? '' : facts(f)}${timeline(f)}${together(f, '../')}${comply(f.g, '../')}<section class="box"><h2>${t.guideH}</h2><p>${L === 'ko' ? '부스 질문 목록, 견적을 착지원가로 바꾸는 방법, 귀국 후 후속 연락까지 한 번에 정리한 가이드가 있습니다.' : 'A full guide covers booth questions, turning quotes into landed cost and follow-up after the fair.'}</p><a class="gl2" href="../guide.html">${L === 'ko' ? '참관·상담 가이드 보기' : 'Read the visitor guide'}</a></section>
<section class="box"><h2>${L === 'ko' ? '함께 쓰는 도구' : 'Related tools'}</h2><div class="tl">${t.tools.map(([h, n]) => `<a href="../../${h}">${esc(n)}</a>`).join('')}</div></section>
${rel.length ? `<h2 class="sh">${L === 'ko' ? `같은 분야의 다른 전시회` : 'More fairs in this industry'}</h2>${rel.map(x => row(x, t, '../')).join('')}` : ''}${note}` }));
  }
}
console.log(`fairs: ${keep.length} kept (${autoN} auto), ${dropped.length} pruned, ${files.length} pages${warn.length ? '\nWARN:\n' + warn.join('\n') : ''}`);
