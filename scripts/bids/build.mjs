// Builds crawlable static tender pages from data/bids/open.json: bids/ (KO) and en/bids/ (EN), index + per-source pages.
import fs from 'fs';
const BASE = 'https://procurement-toolkit-eight.vercel.app';
const data = JSON.parse(fs.existsSync('data/bids/open.json') ? fs.readFileSync('data/bids/open.json', 'utf8') : '[]');
const status = fs.existsSync('data/bids/status.json') ? JSON.parse(fs.readFileSync('data/bids/status.json', 'utf8')) : {};
const today = new Date().toISOString().slice(0, 10);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SRC = {
  'korea-g2b': { ko: '나라장터(한국)', en: 'Korea (G2B / KONEPS)', credit: { ko: '출처: 조달청 나라장터 공공데이터포털 입찰공고 API', en: 'Source: Public Procurement Service (PPS) bid notice open API, data.go.kr' } },
  'world-bank': { ko: '세계은행', en: 'World Bank', credit: { ko: '출처: World Bank Procurement Notices API', en: 'Source: World Bank Procurement Notices API' } },
  uk: { ko: '영국 Contracts Finder', en: 'UK Contracts Finder', credit: { ko: '출처: UK Contracts Finder (Open Government Licence v3.0)', en: 'Source: UK Contracts Finder, contains public sector information licensed under the Open Government Licence v3.0' } },
  ungm: { ko: 'UN 조달(UNGM)', en: 'UN Global Marketplace (UNGM)', credit: { ko: '출처: UN Global Marketplace 공개 입찰공고', en: 'Source: UN Global Marketplace public notices' } },
  undp: { ko: 'UNDP 조달', en: 'UNDP Procurement Notices', credit: { ko: '출처: UNDP Procurement Notices', en: 'Source: UNDP Procurement Notices' } },
  'canada-buys': { ko: '캐나다 CanadaBuys', en: 'Canada CanadaBuys', credit: { ko: '출처: CanadaBuys 공개 데이터 (Open Government Licence – Canada)', en: 'Source: CanadaBuys open data, Open Government Licence – Canada' } },
  prozorro: { ko: '우크라이나 Prozorro', en: 'Ukraine Prozorro', credit: { ko: '출처: Prozorro 공개 API', en: 'Source: Prozorro public API' } },
  'eu-ted': { ko: 'EU TED', en: 'EU TED (Tenders Electronic Daily)', credit: { ko: '출처: EU Publications Office TED', en: 'Source: Publications Office of the EU, TED' } },
};
const T = {
  ko: { lang: 'ko', dir: 'bids', title: '공공 입찰·수주 기회 모음 — 국내외 최신 입찰공고', h1: '공공 입찰·수주 기회 모음', desc: n => `나라장터·세계은행·영국·EU 등 공식 공개 데이터에서 모은 진행 중 입찰공고 ${n}건. 매일 갱신, 원문 링크 제공.`, sub: '공식 공개 API의 입찰공고를 매일 모아 보여줍니다. 최종 조건과 마감은 반드시 원문에서 확인하세요.', search: '검색 (제목·기관·국가)', all: '전체', allC: '모든 국가', soon: '마감 7일 이내', deadline: '마감', pub: '공고', org: '발주기관', open: '원문 보기', none: '표시할 공고가 없습니다.', srcs: '출처별 보기', upd: '갱신', count: '건', note: '이 페이지는 공개된 입찰공고를 재가공해 보여주는 정보 제공용입니다. 입찰 참여·계약은 각 발주기관 공식 사이트에서 진행됩니다.', hub: '데이터 레이더', hubHref: '../data-radar-hub.html', other: { href: '../en/bids/', label: 'English' }, noKR: '나라장터 데이터는 API 인증 승인 후 표시됩니다.', loc: 'ko-KR' },
  en: { lang: 'en', dir: 'en/bids', title: 'Public Tenders & Bid Opportunities — Latest Notices Worldwide', h1: 'Public Tenders & Bid Opportunities', desc: n => `${n} open tender notices aggregated daily from official open data: World Bank, UK Contracts Finder, EU TED and more. Links to the original notices.`, sub: 'Open tender notices from official open APIs, refreshed daily. Always confirm requirements and deadlines on the original notice.', search: 'Search (title, buyer, country)', all: 'All', allC: 'All countries', soon: 'Closing in 7 days', deadline: 'Deadline', pub: 'Published', org: 'Buyer', open: 'View original', none: 'No notices to show.', srcs: 'Browse by source', upd: 'Updated', count: '', note: 'This page reformats publicly available tender notices for information only. Bidding and contracting happen on each buyer’s official site.', hub: 'Data Radar', hubHref: '../../data-radar-hub.html', other: { href: '../../bids/', label: '한국어' }, noKR: '', loc: 'en-GB' },
};
const CSS = `:root{--ink:#16232e;--paper:#e7e2d3;--card:#f4f1e7;--line:#b9af98;--rust:#a63d22}*{box-sizing:border-box}body{background:var(--paper);color:var(--ink);font-family:Inter,system-ui,sans-serif;margin:0;line-height:1.6}header{background:var(--ink);padding:14px 20px;display:flex;justify-content:space-between;gap:12px}header a{color:var(--paper);text-decoration:none;font-weight:600;font-size:14px}.wrap{max-width:900px;margin:0 auto;padding:24px 16px 56px}h1{font-size:1.45rem;margin:0 0 6px}.sub{color:#51606b;font-size:.92rem;margin:0 0 16px}.bar{display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px;margin:14px 0}.bar input,.bar select{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:#fff;font:inherit;font-size:14px}.chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px}.chip{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid var(--line);border-radius:99px;background:var(--card);font-size:13px;color:var(--ink);text-decoration:none;cursor:pointer}.chip.on{background:var(--ink);color:var(--paper);border-color:var(--ink)}.chip svg{width:16px;height:16px;fill:currentColor}.item{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin:0 0 8px;overflow-wrap:anywhere}.item a{color:var(--ink);font-weight:600;text-decoration:none}.item a:hover{color:var(--rust)}.meta{font-size:12.5px;color:#51606b;margin-top:4px;display:flex;flex-wrap:wrap;gap:4px 12px}.tag{font-size:11px;padding:2px 8px;border-radius:99px;background:var(--ink);color:var(--paper)}.dl{color:var(--rust);font-weight:600}.desc{margin:4px 0 0;font-size:13px;color:#3b4954}.note{font-size:12.5px;color:#51606b;margin-top:24px;border-top:1px solid var(--line);padding-top:12px}@media(max-width:640px){.bar{grid-template-columns:1fr}.wrap{padding:18px 16px 48px}}`;
const ICON = { gavel: 'M160-120v-80h480v80H160Zm226-194L160-540l84-86 228 226-86 86Zm254-254L414-794l86-86 226 226-86 86Zm184 408L302-682l56-56 522 522-56 56Z' };
const svg = d => `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="${d}"/></svg>`;
function desc(x, t) {
  const s = SRC[x.source]?.[t.lang] || x.source;
  const kw = [...new Set(String(x.title).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(w => w.length > 3))].slice(0, 6).join(', ');
  if (t.lang === 'ko') return `${x.org ? x.org + '이(가) ' : ''}${x.country ? x.country + '에서 ' : ''}${s}에 공고한 입찰·조달 건입니다.${x.published ? ' 공고일 ' + x.published + '.' : ''}${x.deadline ? ' 제출 마감 ' + x.deadline + '.' : ''}${x.category ? ' 유형: ' + x.category + '.' : ''}${kw ? ' 관련 키워드: ' + kw + '.' : ''}`;
  return `Tender notice${x.org ? ' from ' + x.org : ''}${x.country ? ' (' + x.country + ')' : ''} listed on ${s}.${x.published ? ' Published ' + x.published + '.' : ''}${x.deadline ? ' Submission deadline ' + x.deadline + '.' : ''}${x.category ? ' Type: ' + x.category + '.' : ''}${kw ? ' Keywords: ' + kw + '.' : ''}`;
}
function row(x, t) {
  const s = SRC[x.source]?.[t.lang] || x.source;
  const soon = x.deadline && x.deadline <= new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  return `<div class="item" data-s="${esc(x.source)}" data-c="${esc(x.country)}" data-d="${esc(x.deadline)}" data-q="${esc((x.title + ' ' + x.org + ' ' + x.country).toLowerCase())}"><a href="${esc(x.url)}" target="_blank" rel="noopener nofollow">${esc(x.title)}</a><p class="desc">${esc(desc(x, t))}</p><div class="meta"><span class="tag">${esc(s)}</span>${x.org ? `<span>${t.org}: ${esc(x.org)}</span>` : ''}${x.country ? `<span>${esc(x.country)}</span>` : ''}${x.deadline ? `<span class="${soon ? 'dl' : ''}">${t.deadline} ${esc(x.deadline)}</span>` : ''}${x.published ? `<span>${t.pub} ${esc(x.published)}</span>` : ''}${x.value ? `<span>${esc(x.value)}</span>` : ''}${x.category ? `<span>${esc(x.category)}</span>` : ''}</div></div>`;
}
function page(t, list, srcKey) {
  const file = srcKey ? `${t.dir}/${srcKey}.html` : `${t.dir}/index.html`;
  const name = srcKey ? SRC[srcKey][t.lang] : '';
  const title = (srcKey ? `${name} — ${t.h1}` : t.title) + ' | CBM Lab';
  const desc = t.desc(list.length);
  const url = `${BASE}/${file}`;
  const sorted = [...list].sort((a, b) => (b.published || '').localeCompare(a.published || '') || (a.deadline || '9999').localeCompare(b.deadline || '9999'));
  const shown = sorted.slice(0, 300);
  const countries = [...new Set(list.map(x => x.country).filter(Boolean))].sort();
  const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description: desc, url, inLanguage: t.lang, dateModified: today, mainEntity: { '@type': 'ItemList', numberOfItems: list.length, itemListElement: shown.slice(0, 50).map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: x.title, url: x.url })) } };
  const sources = Object.keys(SRC).filter(k => data.some(x => x.source === k));
  const chips = `<div class="chips"><a class="chip${srcKey ? '' : ' on'}" href="${srcKey ? './' : ''}">${svg(ICON.gavel)}${t.all} (${data.length})</a>${sources.map(k => `<a class="chip${k === srcKey ? ' on' : ''}" href="${k}.html">${esc(SRC[k][t.lang])} (${data.filter(x => x.source === k).length})</a>`).join('')}</div>`;
  const credits = [...new Set(list.map(x => x.source))].map(k => SRC[k]?.credit[t.lang]).filter(Boolean).join(' · ');
  const noKR = (!data.some(x => x.source === 'korea-g2b') && t.noKR) ? `<p class="sub">${t.noKR}</p>` : '';
  const html = `<!DOCTYPE html>
<html lang="${t.lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><meta property="og:type" content="website">
<link rel="alternate" hreflang="${t.lang === 'ko' ? 'en' : 'ko'}" href="${BASE}/${t.lang === 'ko' ? 'en/bids' : 'bids'}/${srcKey ? srcKey + '.html' : 'index.html'}">
<script type="application/ld+json">${JSON.stringify(ld)}</script><style>${CSS}</style></head><body>
<header><a href="${t.hubHref}">CBM LAB · ${t.hub}</a><a href="${srcKey ? t.other.href + srcKey + '.html' : t.other.href}">${t.other.label}</a></header>
<div class="wrap"><h1>${esc(srcKey ? name : t.h1)}</h1><p class="sub">${t.sub} · ${t.upd} ${today} · ${list.length}${t.count}</p>${chips}${noKR}
<div class="bar"><input id="q" type="search" placeholder="${t.search}" aria-label="${t.search}"><select id="c"><option value="">${t.allC}</option>${countries.map(c => `<option>${esc(c)}</option>`).join('')}</select><select id="d"><option value="">${t.deadline}: ${t.all}</option><option value="7">${t.soon}</option></select></div>
<div id="list">${shown.map(x => row(x, t)).join('') || `<p>${t.none}</p>`}</div><p id="empty" hidden>${t.none}</p>
<p class="note">${esc(credits)}<br>${t.note}</p></div>
<script>(function(){var q=document.getElementById('q'),c=document.getElementById('c'),d=document.getElementById('d'),it=[].slice.call(document.querySelectorAll('.item')),e=document.getElementById('empty');function f(){var s=q.value.toLowerCase().trim(),k=c.value,n=d.value,lim=n?new Date(Date.now()+n*864e5).toISOString().slice(0,10):'',v=0;it.forEach(function(x){var ok=(!s||x.dataset.q.indexOf(s)>-1)&&(!k||x.dataset.c===k)&&(!lim||(x.dataset.d&&x.dataset.d<=lim));x.hidden=!ok;if(ok)v++});e.hidden=v>0}q.oninput=c.onchange=d.onchange=f})();</script></body></html>`;
  fs.mkdirSync(t.dir, { recursive: true });
  fs.writeFileSync(file, html);
  return file;
}
const files = [];
for (const t of Object.values(T)) {
  files.push(page(t, data, null));
  for (const k of Object.keys(SRC)) { const l = data.filter(x => x.source === k); if (l.length) files.push(page(t, l, k)); }
}
console.log('built', files.length, 'pages for', data.length, 'notices');
