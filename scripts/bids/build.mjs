// Builds crawlable static tender pages from data/bids/open.json: bids/ (KO) and en/bids/ (EN), index + per-source pages.
import fs from 'fs';
import crypto from 'crypto';
const BASE = 'https://procurement-toolkit-eight.vercel.app';
const data = JSON.parse(fs.existsSync('data/bids/open.json') ? fs.readFileSync('data/bids/open.json', 'utf8') : '[]');
const status = fs.existsSync('data/bids/status.json') ? JSON.parse(fs.readFileSync('data/bids/status.json', 'utf8')) : {};
const today = new Date().toISOString().slice(0, 10);
const dec = v => String(v ?? '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0*39;|&#x27;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
for (const x of data) { x.title = dec(x.title); x.org = dec(x.org); x.category = dec(x.category); }
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SRC = {
  'korea-g2b': { ko: '나라장터(한국)', en: 'Korea (G2B / KONEPS)', credit: { ko: '출처: 조달청 나라장터 공공데이터포털 입찰공고 API', en: 'Source: Public Procurement Service (PPS) bid notice open API, data.go.kr' } },
  'world-bank': { ko: '세계은행', en: 'World Bank', credit: { ko: '출처: World Bank Procurement Notices API', en: 'Source: World Bank Procurement Notices API' } },
  uk: { ko: '영국 Contracts Finder', en: 'UK Contracts Finder', credit: { ko: '출처: UK Contracts Finder (Open Government Licence v3.0)', en: 'Source: UK Contracts Finder, contains public sector information licensed under the Open Government Licence v3.0' } },
  ungm: { ko: 'UN 조달(UNGM)', en: 'UN Global Marketplace (UNGM)', credit: { ko: '출처: UN Global Marketplace 공개 입찰공고', en: 'Source: UN Global Marketplace public notices' } },
  'boamp-fr': { ko: '프랑스 BOAMP', en: 'France BOAMP', credit: { ko: '출처: BOAMP (프랑스 DILA, Licence Ouverte)', en: 'Source: BOAMP, DILA France (Licence Ouverte)' } },
  'find-tender-uk': { ko: '영국 Find a Tender', en: 'UK Find a Tender', credit: { ko: '출처: UK Find a Tender Service (Open Government Licence v3.0)', en: 'Source: UK Find a Tender Service, Open Government Licence v3.0' } },
  'secop-co': { ko: '콜롬비아 SECOP II', en: 'Colombia SECOP II', credit: { ko: '출처: 콜롬비아 공공데이터(datos.gov.co) SECOP II', en: 'Source: Colombia open data (datos.gov.co), SECOP II' } },
  undp: { ko: 'UNDP 조달', en: 'UNDP Procurement Notices', credit: { ko: '출처: UNDP Procurement Notices', en: 'Source: UNDP Procurement Notices' } },
  'canada-buys': { ko: '캐나다 CanadaBuys', en: 'Canada CanadaBuys', credit: { ko: '출처: CanadaBuys 공개 데이터 (Open Government Licence – Canada)', en: 'Source: CanadaBuys open data, Open Government Licence – Canada' } },
  prozorro: { ko: '우크라이나 Prozorro', en: 'Ukraine Prozorro', credit: { ko: '출처: Prozorro 공개 API', en: 'Source: Prozorro public API' } },
  'eu-ted': { ko: 'EU TED', en: 'EU TED (Tenders Electronic Daily)', credit: { ko: '출처: EU Publications Office TED', en: 'Source: Publications Office of the EU, TED' } },
};
const SECTORS = [
  ['construction', { ko: '건설·인프라', en: 'Construction & infrastructure' }, /construct|civil work|road|bridge|building|rehabilit|renovat|infrastructure|water supply|sanitation|sewer|travaux|construc|obra|bâtiment|batiment|voirie|건설|공사|시공/i],
  ['it', { ko: 'IT·소프트웨어', en: 'IT & software' }, /software|\bIT\b|information system|digital|cyber|network|server|database|website|cloud|licen[sc]e|informatique|logiciel|système d|sistema de informaci|소프트웨어|정보시스템/i],
  ['health', { ko: '보건·의료', en: 'Health & medical' }, /medical|health|hospital|vaccin|pharma|drug|laborator|clinic|dental|médic|medic|santé|sante|salud|의료|보건|병원|의약/i],
  ['consulting', { ko: '컨설팅·용역', en: 'Consulting & services' }, /consult|advisory|evaluation|assessment|study|training|audit|technical assistance|expert|individual contractor|\bIC\b|facilitat|conseil|étude|etude|formation|consultor|asesor|용역|컨설팅|연구/i],
  ['transport', { ko: '운송·차량', en: 'Transport & vehicles' }, /vehicle|transport|truck|bus\b|fleet|logistic|freight|shipping|aircraft|véhicule|vehicule|transporte|veh[ií]culo|차량|운송|물류/i],
  ['energy', { ko: '에너지·환경', en: 'Energy & environment' }, /energy|solar|power|electric|generator|fuel|grid|waste|environment|climate|énergie|energie|déchet|energ[ií]a|에너지|태양광|전력|환경/i],
  ['food', { ko: '식품·농업', en: 'Food & agriculture' }, /food|agricultur|crop|seed|fertili[sz]|livestock|fish|catering|nutrition|alimentaire|agricole|aliment|식품|농업|급식/i],
  ['education', { ko: '교육·연구', en: 'Education & research' }, /school|education|university|textbook|curriculum|scholar|éducation|educaci|교육|학교|대학/i],
  ['equipment', { ko: '장비·물품', en: 'Equipment & supplies' }, /supply|equipment|furniture|machine|instrument|tools?\b|uniform|printing|stationery|materiel|matériel|fourniture|suministro|equipo|장비|물품|구매|납품/i],
];
const SECTOR_OTHER = ['other', { ko: '기타', en: 'Other' }];
const sectorOf = x => { const h = `${x.title} ${x.category}`; for (const [k, , re] of SECTORS) if (re.test(h)) return k; return 'other'; };
for (const x of data) x.sector = sectorOf(x);
const SECT_LABEL = Object.fromEntries([...SECTORS.map(([k, l]) => [k, l]), SECTOR_OTHER]);
const T = {
  ko: { lang: 'ko', dir: 'bids', title: '공공 입찰·수주 기회 모음 — 국내외 최신 입찰공고', h1: '공공 입찰·수주 기회 모음', desc: n => `나라장터·세계은행·영국·EU 등 공식 공개 데이터에서 모은 진행 중 입찰공고 ${n}건. 매일 갱신, 원문 링크 제공.`, sub: '공식 공개 API의 입찰공고를 매일 모아 보여줍니다. 최종 조건과 마감은 반드시 원문에서 확인하세요.', search: '검색 (제목·기관·국가)', all: '전체', sector: '분야', countries: '국가별', allCountries: '전체 국가 보기', sectors: '분야별', total: '진행 중 공고', newToday: '오늘 신규', nCountries: '국가', nSources: '출처', results: '검색 결과', showing: '표시', loading: '전체 데이터 검색 중…', more: '더 보기', home: '입찰·수주 기회',  allC: '모든 국가', soon: '마감 7일 이내', deadline: '마감', pub: '공고', org: '발주기관', open: '원문 보기', none: '표시할 공고가 없습니다.', srcs: '출처별 보기', upd: '갱신', count: '건', note: '이 페이지는 공개된 입찰공고를 재가공해 보여주는 정보 제공용입니다. 입찰 참여·계약은 각 발주기관 공식 사이트에서 진행됩니다.', hub: '데이터 레이더', hubHref: '../data-radar-hub.html', other: { href: '../en/bids/', label: 'English' }, noKR: '나라장터 데이터는 API 인증 승인 후 표시됩니다.', loc: 'ko-KR' },
  en: { lang: 'en', dir: 'en/bids', title: 'Public Tenders & Bid Opportunities — Latest Notices Worldwide', h1: 'Public Tenders & Bid Opportunities', desc: n => `${n} open tender notices aggregated daily from official open data: World Bank, UK Contracts Finder, EU TED and more. Links to the original notices.`, sub: 'Open tender notices from official open APIs, refreshed daily. Always confirm requirements and deadlines on the original notice.', search: 'Search (title, buyer, country)', all: 'All', sector: 'Sector', countries: 'By country', allCountries: 'All countries', sectors: 'By sector', total: 'Open notices', newToday: 'New today', nCountries: 'Countries', nSources: 'Sources', results: 'Results', showing: 'Showing', loading: 'Searching all notices…', more: 'Show more', home: 'Tenders',  allC: 'All countries', soon: 'Closing in 7 days', deadline: 'Deadline', pub: 'Published', org: 'Buyer', open: 'View original', none: 'No notices to show.', srcs: 'Browse by source', upd: 'Updated', count: '', note: 'This page reformats publicly available tender notices for information only. Bidding and contracting happen on each buyer’s official site.', hub: 'Data Radar', hubHref: '../../data-radar-hub.html', other: { href: '../../bids/', label: '한국어' }, noKR: '', loc: 'en-GB' },
};

const ICONS = JSON.parse(fs.readFileSync('scripts/bids/icons.json', 'utf8'));
const svg = n => `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="${ICONS[n]}"/></svg>`;
const SEC_ICON = { construction: 'construction', it: 'code', health: 'medical_services', consulting: 'work', transport: 'local_shipping', energy: 'bolt', food: 'agriculture', education: 'school', equipment: 'inventory_2', other: 'category' };
const CSS = `:root{--ink:#16232e;--paper:#ece8db;--card:#fbf9f2;--line:#d3cbb6;--rust:#a63d22;--mute:#5a6872}*{box-sizing:border-box}body{background:var(--paper);color:var(--ink);font-family:Inter,system-ui,-apple-system,"Noto Sans KR",sans-serif;margin:0;line-height:1.6}a{color:inherit}header.top{background:var(--ink);padding:14px 20px;display:flex;justify-content:space-between;gap:12px}header.top a{color:#ece8db;text-decoration:none;font-weight:600;font-size:14px}.hero{background:var(--ink);color:#ece8db;padding:8px 20px 30px}.hero .in{max-width:960px;margin:0 auto}.hero h1{font-size:1.65rem;margin:10px 0 6px;line-height:1.3}.hero p{margin:0 0 16px;color:#c9c4b3;font-size:.95rem;max-width:640px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.stat{background:rgba(255,255,255,.07);border-radius:12px;padding:10px 14px}.stat b{display:block;font-size:1.35rem;line-height:1.2}.stat span{font-size:12px;color:#c9c4b3}.wrap{max-width:960px;margin:0 auto;padding:22px 16px 56px}h2.sh{font-size:.95rem;margin:22px 0 10px;color:var(--mute);font-weight:700;letter-spacing:.02em}.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}.tile{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--card);border:1px solid var(--line);border-radius:12px;text-decoration:none;font-size:13.5px;font-weight:600}.tile svg{width:22px;height:22px;fill:var(--rust);flex:none}.tile small{display:block;font-weight:400;color:var(--mute);font-size:12px}.tile:hover,.tile.on{border-color:var(--ink)}.tile.on{background:var(--ink);color:#ece8db}.tile.on svg{fill:#ece8db}.tile.on small{color:#c9c4b3}.chips{display:flex;flex-wrap:wrap;gap:8px}.chip{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid var(--line);border-radius:99px;background:var(--card);font-size:13px;text-decoration:none}.chip:hover,.chip.on{background:var(--ink);color:#ece8db;border-color:var(--ink)}.bar{position:sticky;top:0;z-index:5;background:var(--paper);padding:10px 0;display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px}.sf{position:relative}.sf svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);width:20px;height:20px;fill:var(--mute)}.bar input,.bar select{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;font:inherit;font-size:14px;color:var(--ink)}.sf input{padding-left:38px}.count{font-size:13px;color:var(--mute);margin:6px 2px 10px}.item{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:0 0 10px;overflow-wrap:anywhere}.item .t{font-weight:700;text-decoration:none;font-size:15px;line-height:1.45}.item .t:hover{color:var(--rust)}.meta{font-size:12.5px;color:var(--mute);margin-top:8px;display:flex;flex-wrap:wrap;gap:4px 14px;align-items:center}.meta span{display:inline-flex;align-items:center;gap:4px}.meta svg{width:15px;height:15px;fill:var(--mute)}.tag{font-size:11px;padding:2px 9px;border-radius:99px;background:var(--ink);color:#ece8db}.tag.sec{background:var(--rust)}.dl{color:var(--rust);font-weight:700}.dl svg{fill:var(--rust)}.desc{margin:6px 0 0;font-size:13px;color:#3b4954}.btn{display:block;width:100%;margin:12px 0;padding:12px;border:1px solid var(--ink);border-radius:10px;background:transparent;font:inherit;font-weight:600;cursor:pointer;color:var(--ink)}.note{font-size:12.5px;color:var(--mute);margin-top:26px;border-top:1px solid var(--line);padding-top:12px}.crumb{font-size:13px;color:#c9c4b3;text-decoration:none}@media(max-width:700px){.stats{grid-template-columns:repeat(2,1fr)}.bar{grid-template-columns:1fr 1fr;position:static}.bar .sf{grid-column:1/-1}.hero h1{font-size:1.4rem}.wrap{padding:18px 14px 48px}.tiles{grid-template-columns:repeat(2,1fr)}}`;
const slugify = s => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '') || 'x';
function descr(x, t) {
  const s = SRC[x.source]?.[t.lang] || x.source;
  const kw = [...new Set(String(x.title).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(w => w.length > 3))].slice(0, 6).join(', ');
  if (t.lang === 'ko') return `${s}에 공고된 입찰·조달 건입니다.${x.org ? ' 발주기관: ' + x.org + '.' : ''}${x.country ? ' 국가: ' + x.country + '.' : ''}${x.published ? ' 공고일 ' + x.published + '.' : ''}${x.deadline ? ' 제출 마감 ' + x.deadline + '.' : ''}${x.category ? ' 유형: ' + x.category + '.' : ''}${kw ? ' 관련 키워드: ' + kw + '.' : ''}`;
  return `Tender notice${x.org ? ' from ' + x.org : ''}${x.country ? ' (' + x.country + ')' : ''} listed on ${s}.${x.published ? ' Published ' + x.published + '.' : ''}${x.deadline ? ' Submission deadline ' + x.deadline + '.' : ''}${x.category ? ' Type: ' + x.category + '.' : ''}${kw ? ' Keywords: ' + kw + '.' : ''}`;
}
const soonLimit = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
function row(x, t, up) {
  const s = SRC[x.source]?.[t.lang] || x.source, soon = x.deadline && x.deadline <= soonLimit;
  return `<article class="item" data-i="${x.i}"><a class="t" href="${up}n/${x.h}">${esc(x.title)}</a><p class="desc">${esc(descr(x, t))}</p><div class="meta"><span class="tag">${esc(s)}</span><span class="tag sec">${esc(SECT_LABEL[x.sector][t.lang])}</span>${x.org ? `<span>${esc(x.org)}</span>` : ''}${x.country ? `<span>${svg('public')}${esc(x.country)}</span>` : ''}${x.deadline ? `<span class="${soon ? 'dl' : ''}">${svg('schedule')}${t.deadline} ${esc(x.deadline)}</span>` : ''}${x.published ? `<span>${t.pub} ${esc(x.published)}</span>` : ''}${x.value ? `<span>${esc(x.value)}</span>` : ''}</div></article>`;
}
data.sort((a, b) => (b.published || '').localeCompare(a.published || '') || (a.deadline || '9999').localeCompare(b.deadline || '9999'));
data.forEach((x, i) => { x.i = i; x.country = (x.country || '').trim(); x.h = crypto.createHash('sha1').update(x.id).digest('hex').slice(0, 10); });
const byC = {}; for (const x of data) if (x.country) (byC[x.country] ||= []).push(x);
const countries = Object.entries(byC).sort((a, b) => b[1].length - a[1].length);
const cSlug = Object.fromEntries(countries.map(([c]) => [c, slugify(c)]));
const cPages = countries.filter(([, l]) => l.length >= 3);
const sourcesAll = Object.keys(SRC).filter(k => data.some(x => x.source === k));
const sectAll = [...SECTORS.map(x => x[0]), 'other'].filter(k => data.some(x => x.sector === k));
const newToday = data.filter(x => x.published === today).length;

function page(t, o) {
  // o: {kind:'index'|'source'|'sector'|'country'|'countries', key, list, name}
  const L = t.lang, prefix = o.kind === 'country' ? 'country/' : '';
  const slug = o.kind === 'index' ? 'index' : o.kind === 'source' ? o.key : o.kind === 'sector' ? 'c-' + o.key : o.kind === 'countries' ? 'countries' : 'country/' + cSlug[o.key];
  const file = `${t.dir}/${slug}.html`, url = `${BASE}/${file}`;
  const rel = n => (o.kind === 'country' ? '../' : '') + n;           // relative link from this page's dir
  const list = o.list;
  const title = (o.kind === 'index' ? t.title : o.kind === 'countries' ? `${t.allCountries} — ${t.h1}` : L === 'ko' && o.kind === 'country' ? `${o.name} 입찰공고 — 최신 공공입찰·수주 기회` : o.kind === 'country' ? `${o.name} Tenders — Latest Public Bid Opportunities` : `${o.name} — ${t.h1}`) + ' | CBM Lab';
  const desc = t.desc(list.length);
  const limit = o.kind === 'index' ? 100 : 60, shown = o.kind === 'countries' ? [] : list.slice(0, limit);
  const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description: desc, url, inLanguage: L, dateModified: today, mainEntity: { '@type': 'ItemList', numberOfItems: list.length, itemListElement: shown.slice(0, 50).map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: x.title, url: x.url })) } };
  const root = o.kind === 'country' ? '../' : '';
  const stats = o.kind === 'index' ? `<div class="stats"><div class="stat"><b>${data.length.toLocaleString(t.loc)}</b><span>${t.total}</span></div><div class="stat"><b>${newToday.toLocaleString(t.loc)}</b><span>${t.newToday}</span></div><div class="stat"><b>${countries.length}</b><span>${t.nCountries}</span></div><div class="stat"><b>${sourcesAll.length}</b><span>${t.nSources}</span></div></div>` : '';
  const heroTitle = o.kind === 'index' ? t.h1 : o.name || t.allCountries;
  const sectTiles = `<h2 class="sh">${t.sectors}</h2><div class="tiles">${sectAll.map(k => `<a class="tile${o.kind === 'sector' && o.key === k ? ' on' : ''}" href="${rel('c-' + k + '.html')}">${svg(SEC_ICON[k])}<span>${esc(SECT_LABEL[k][L])}<small>${data.filter(x => x.sector === k).length}</small></span></a>`).join('')}</div>`;
  const cChips = `<h2 class="sh">${t.countries}</h2><div class="chips">${cPages.slice(0, 16).map(([c, l]) => `<a class="chip${o.kind === 'country' && o.key === c ? ' on' : ''}" href="${o.kind === 'country' ? '' : 'country/'}${cSlug[c]}.html">${esc(c)} (${l.length})</a>`).join('')}<a class="chip" href="${rel('countries.html')}">${svg('language')}${t.allCountries}</a></div>`;
  const srcChips = `<h2 class="sh">${t.srcs}</h2><div class="chips">${sourcesAll.map(k => `<a class="chip${o.kind === 'source' && o.key === k ? ' on' : ''}" href="${rel(k + '.html')}">${esc(SRC[k][L])} (${data.filter(x => x.source === k).length})</a>`).join('')}</div>`;
  const countriesBody = o.kind === 'countries' ? `<h2 class="sh">${t.countries} (${cPages.length})</h2><div class="chips">${cPages.map(([c, l]) => `<a class="chip" href="country/${cSlug[c]}.html">${esc(c)} (${l.length})</a>`).join('')}</div>` : '';
  const controls = o.kind === 'countries' ? '' : `<div class="bar"><div class="sf">${svg('search')}<input id="q" type="search" placeholder="${t.search}" aria-label="${t.search}"></div><select id="c" aria-label="${t.allC}"><option value="">${t.allC}</option>${countries.map(([c]) => `<option>${esc(c)}</option>`).join('')}</select><select id="t" aria-label="${t.sector}"><option value="">${t.sector}: ${t.all}</option>${sectAll.map(k => `<option value="${k}">${esc(SECT_LABEL[k][L])}</option>`).join('')}</select><select id="d" aria-label="${t.deadline}"><option value="">${t.deadline}: ${t.all}</option><option value="7">${t.soon}</option></select></div><p class="count" id="cnt">${list.length.toLocaleString(t.loc)} ${t.count || ''}</p>`;
  const credits = [...new Set(list.map(x => x.source))].map(k => SRC[k]?.credit[L]).filter(Boolean).join(' · ');
  const noKR = (!data.some(x => x.source === 'korea-g2b') && t.noKR && o.kind === 'index') ? `<p class="count">${t.noKR}</p>` : '';
  const scope = o.kind === 'index' ? 'all' : o.kind === 'source' ? 'source:' + o.key : o.kind === 'sector' ? 'sector:' + o.key : o.kind === 'country' ? 'country:' + o.key : '';
  const html = `<!DOCTYPE html>
<html lang="${L}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><meta property="og:type" content="website">
<link rel="alternate" hreflang="${L === 'ko' ? 'en' : 'ko'}" href="${BASE}/${L === 'ko' ? 'en/bids' : 'bids'}/${slug}.html">
<script type="application/ld+json">${JSON.stringify(ld)}</script><style>${CSS}</style></head><body>
<header class="top"><a href="${root}${t.hubHref}">CBM LAB · ${t.hub}</a><a href="${root}${L === 'ko' ? '../en/bids/' : '../../bids/'}${slug}.html" hreflang="${L === 'ko' ? 'en' : 'ko'}">${t.other.label}</a></header>
<div class="hero"><div class="in">${o.kind !== 'index' ? `<a class="crumb" href="${rel('index.html')}">← ${t.home}</a>` : ''}<h1>${esc(heroTitle)}</h1><p>${t.sub}</p>${stats}</div></div>
<div class="wrap">${controls}${noKR}<div id="list">${shown.map(x => row(x, t, o.kind === 'country' ? '../' : '')).join('')}</div>${o.kind !== 'countries' ? `<button class="btn" id="more" hidden>${t.more}</button>` : ''}${countriesBody}${o.kind === 'countries' ? '' : sectTiles + cChips + srcChips}<p class="note">${esc(credits)}<br>${t.note}</p></div>
<script>(function(){var UP=${JSON.stringify(o.kind === 'country' ? '../' : '')},SCOPE=${JSON.stringify(scope)},LANG=${JSON.stringify(L)},SOON=${JSON.stringify(soonLimit)};var q=document.getElementById('q');if(!q)return;var c=document.getElementById('c'),d=document.getElementById('d'),sc=document.getElementById('t'),list=document.getElementById('list'),cnt=document.getElementById('cnt'),more=document.getElementById('more'),T=${JSON.stringify({ deadline: t.deadline, pub: t.pub, none: t.none, loading: t.loading, count: t.count || '' })},DATA=null,res=[],shown=0,orig=list.innerHTML;
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(m){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]})}
function inScope(r){if(SCOPE==='all'||!SCOPE)return true;var p=SCOPE.split(':');var k=p.shift(),v=p.join(':');return k==='source'?r.s===v:k==='sector'?r.t===v:r.c===v}
function card(r){return '<article class="item"><a class="t" href="'+UP+'n/'+r.h+'">'+esc(r.n)+'</a><p class="desc">'+esc(r.x)+'</p><div class="meta"><span class="tag">'+esc(r.sl)+'</span><span class="tag sec">'+esc(r.tl)+'</span>'+(r.o?'<span>'+esc(r.o)+'</span>':'')+(r.c?'<span>'+esc(r.c)+'</span>':'')+(r.e?'<span class="'+(r.e<=SOON?'dl':'')+'">'+T.deadline+' '+esc(r.e)+'</span>':'')+(r.p?'<span>'+T.pub+' '+esc(r.p)+'</span>':'')+(r.v?'<span>'+esc(r.v)+'</span>':'')+'</div></article>'}
function draw(){var end=Math.min(res.length,shown);list.innerHTML=res.length?res.slice(0,end).map(card).join(''):'<p>'+T.none+'</p>';more.hidden=end>=res.length;cnt.textContent=res.length.toLocaleString()+' '+T.count}
function run(){var active=q.value.trim()||c.value||sc.value||d.value;if(!active){list.innerHTML=orig;more.hidden=true;cnt.textContent=cnt.dataset.o||cnt.textContent;return}
if(!DATA){cnt.dataset.o=cnt.dataset.o||cnt.textContent;cnt.textContent=T.loading;fetch(UP+'data.json').then(function(r){return r.json()}).then(function(j){DATA=j.filter(inScope);run()});return}
var s=q.value.toLowerCase().trim(),lim=d.value?new Date(Date.now()+7*864e5).toISOString().slice(0,10):'';res=DATA.filter(function(r){return(!s||r.q.indexOf(s)>-1)&&(!c.value||r.c===c.value)&&(!sc.value||r.t===sc.value)&&(!lim||(r.e&&r.e<=lim))});shown=60;draw()}
var tm;q.oninput=function(){clearTimeout(tm);tm=setTimeout(run,180)};c.onchange=sc.onchange=d.onchange=run;more.onclick=function(){shown+=60;draw()};
if(!cnt.dataset.o)cnt.dataset.o=cnt.textContent;q.addEventListener('focus',function(){if(!DATA){fetch(UP+'data.json').then(function(r){return r.json()}).then(function(j){DATA=j.filter(inScope)})}},{once:true})})();</script></body></html>`;
  fs.mkdirSync(`${t.dir}/country`, { recursive: true });
  fs.writeFileSync(file, html);
  return file;
}
const files = [];
for (const t of Object.values(T)) {
  files.push(page(t, { kind: 'index', list: data }));
  files.push(page(t, { kind: 'countries', list: data }));
  for (const k of sourcesAll) files.push(page(t, { kind: 'source', key: k, name: SRC[k][t.lang], list: data.filter(x => x.source === k) }));
  for (const k of sectAll) files.push(page(t, { kind: 'sector', key: k, name: SECT_LABEL[k][t.lang], list: data.filter(x => x.sector === k) }));
  for (const [c, l] of cPages) files.push(page(t, { kind: 'country', key: c, name: c, list: l }));
  // compact searchable dataset for in-page search across ALL notices
  const J = data.map(x => ({ h: x.h, n: x.title, o: x.org, c: x.country, s: x.source, sl: SRC[x.source]?.[t.lang] || x.source, t: x.sector, tl: SECT_LABEL[x.sector][t.lang], p: x.published, e: x.deadline, v: x.value, u: x.url, x: descr(x, t), q: `${x.title} ${x.org} ${x.country} ${x.category}`.toLowerCase() }));
  fs.writeFileSync(`${t.dir}/data.json`, JSON.stringify(J));
}
const pub = data.map(x => ({ h: x.h, n: x.title, o: x.org, c: x.country, cs: x.country ? cSlug[x.country] : '', cp: cPages.some(([c]) => c === x.country), s: x.source, sl: { ko: SRC[x.source]?.ko, en: SRC[x.source]?.en }, t: x.sector, tl: SECT_LABEL[x.sector], p: x.published, e: x.deadline, v: x.value, u: x.url, ct: x.category, d: { ko: descr(x, T.ko), en: descr(x, T.en) }, cr: { ko: SRC[x.source]?.credit.ko, en: SRC[x.source]?.credit.en } }));
fs.writeFileSync('data/bids/pub.json', JSON.stringify(pub));
const smUrls = [];
for (const x of data) { smUrls.push([`${BASE}/bids/n/${x.h}`, `${BASE}/en/bids/n/${x.h}`, x.published || today]); }
const alt = (a, b) => `<xhtml:link rel="alternate" hreflang="ko" href="${a}"/><xhtml:link rel="alternate" hreflang="en" href="${b}"/>`;
fs.writeFileSync('sitemap-bids.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` + smUrls.map(([a, b, d]) => `<url><loc>${a}</loc><lastmod>${d}</lastmod>${alt(a, b)}</url>\n<url><loc>${b}</loc><lastmod>${d}</lastmod>${alt(a, b)}</url>`).join('\n') + '\n</urlset>\n');
console.log('built', files.length, 'pages for', data.length, 'notices;', cPages.length, 'country pages');
