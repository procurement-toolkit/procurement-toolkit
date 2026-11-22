/**
 * CBM Lab — GET /bids/n/:h and /en/bids/n/:h (rewritten here via vercel.json)
 * Server-renders one tender notice as a crawlable page (KO/EN) from data/bids/pub.json.
 */
const fs = require('fs');
const path = require('path');
const BASE = 'https://procurement-toolkit-eight.vercel.app';
let CACHE = null;
function load() {
  if (CACHE) return CACHE;
  const p = path.join(process.cwd(), 'data', 'bids', 'pub.json');
  const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
  CACHE = { arr, map: new Map(arr.map(x => [x.h, x])) };
  return CACHE;
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const S = {
  ko: { notice: '입찰공고', view: '원문 공고 보기', buyer: '발주기관', country: '국가', deadline: '제출 마감', pub: '공고일', type: '유형', value: '추정 금액', source: '출처', sector: '분야', related: '관련 입찰공고', back: '입찰·수주 기회', note: '이 페이지는 공개된 입찰공고를 재가공한 정보 제공용입니다. 입찰 조건과 마감은 반드시 원문에서 확인하세요.', gone: '이 입찰공고는 마감되었거나 더 이상 제공되지 않습니다.', other: 'English', hub: '데이터 레이더', more: '더 많은 공고' },
  en: { notice: 'Tender notice', view: 'View original notice', buyer: 'Buyer', country: 'Country', deadline: 'Submission deadline', pub: 'Published', type: 'Type', value: 'Estimated value', source: 'Source', sector: 'Sector', related: 'Related tenders', back: 'Tenders', note: 'This page reformats a publicly available tender notice for information only. Always confirm requirements and deadlines on the original notice.', gone: 'This tender notice has closed or is no longer available.', other: '한국어', hub: 'Data Radar', more: 'More notices' }
};
const CSS = ':root{--ink:#16232e;--paper:#ece8db;--card:#fbf9f2;--line:#d3cbb6;--rust:#a63d22;--mute:#5a6872}*{box-sizing:border-box}body{background:var(--paper);color:var(--ink);font-family:Inter,system-ui,-apple-system,"Noto Sans KR",sans-serif;margin:0;line-height:1.65}a{color:inherit}header{background:var(--ink);padding:14px 20px;display:flex;justify-content:space-between}header a{color:#ece8db;text-decoration:none;font-weight:600;font-size:14px}.wrap{max-width:820px;margin:0 auto;padding:22px 16px 56px}.crumb{font-size:13px;color:var(--mute);text-decoration:none}h1{font-size:1.45rem;line-height:1.4;margin:10px 0 14px;overflow-wrap:anywhere}.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px}dl{display:grid;grid-template-columns:130px 1fr;gap:8px 14px;margin:0}dt{color:var(--mute);font-size:13px}dd{margin:0;overflow-wrap:anywhere}.dl{color:var(--rust);font-weight:700}.btn{display:inline-block;margin-top:16px;padding:12px 20px;background:var(--ink);color:#ece8db;border-radius:10px;text-decoration:none;font-weight:600}.tag{font-size:11px;padding:2px 9px;border-radius:99px;background:var(--rust);color:#ece8db}p.d{color:#3b4954;font-size:14px;margin:0 0 14px}h2{font-size:1rem;margin:28px 0 10px}ul.rel{list-style:none;margin:0;padding:0}ul.rel li{margin:0 0 8px}ul.rel a{display:block;padding:10px 14px;background:var(--card);border:1px solid var(--line);border-radius:10px;text-decoration:none;font-size:14px;overflow-wrap:anywhere}ul.rel small{display:block;color:var(--mute);font-size:12px}.note{font-size:12.5px;color:var(--mute);margin-top:26px;border-top:1px solid var(--line);padding-top:12px}@media(max-width:600px){dl{grid-template-columns:100px 1fr}h1{font-size:1.25rem}}';
module.exports = function handler(req, res) {
  const lang = req.query.lang === 'en' ? 'en' : 'ko', t = S[lang];
  const pre = lang === 'en' ? '/en/bids' : '/bids', otherPre = lang === 'en' ? '/bids' : '/en/bids';
  let rec;
  try { rec = load().map.get(String(req.query.h || '').replace(/[^a-f0-9]/g, '')); } catch (e) { res.status(500).send('data unavailable'); return; }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  if (!rec) {
    res.status(410).send(`<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t.notice)} | CBM Lab</title><style>${CSS}</style></head><body><div class="wrap"><p>${t.gone}</p><p><a href="${pre}/">${t.back} →</a></p></div></body></html>`);
    return;
  }
  const url = `${BASE}${pre}/n/${rec.h}`, otherUrl = `${BASE}${otherPre}/n/${rec.h}`;
  const title = `${rec.n} — ${rec.o || rec.sl[lang]}${rec.c ? ' (' + rec.c + ')' : ''} | CBM Lab`.slice(0, 300);
  const metaDesc = rec.d[lang].slice(0, 300);
  const sameSector = load().arr.filter(x => x.h !== rec.h && ((rec.c && x.c === rec.c) || x.t === rec.t));
  sameSector.sort((a, b) => ((b.c === rec.c) - (a.c === rec.c)) || (b.p || '').localeCompare(a.p || ''));
  const rel = sameSector.slice(0, 8);
  const ld = { '@context': 'https://schema.org', '@type': 'WebPage', name: rec.n, description: metaDesc, url, inLanguage: lang, datePublished: rec.p || undefined, about: { '@type': 'Thing', name: rec.n }, breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: t.back, item: `${BASE}${pre}/` }, { '@type': 'ListItem', position: 2, name: rec.n, item: url }] } };
  const row = (k, v) => v ? `<dt>${k}</dt><dd>${v}</dd>` : '';
  const soon = rec.e && rec.e <= new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  res.setHeader('cache-control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(`<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(metaDesc)}"><link rel="canonical" href="${url}"><link rel="alternate" hreflang="${lang === 'en' ? 'ko' : 'en'}" href="${otherUrl}"><link rel="alternate" hreflang="${lang}" href="${url}"><meta property="og:title" content="${esc(rec.n)}"><meta property="og:description" content="${esc(metaDesc)}"><meta property="og:url" content="${url}"><meta property="og:type" content="article"><script type="application/ld+json">${JSON.stringify(ld)}</script><style>${CSS}</style></head><body>
<header><a href="/data-radar-hub.html">CBM LAB · ${t.hub}</a><a href="${otherUrl}" hreflang="${lang === 'en' ? 'ko' : 'en'}">${t.other}</a></header>
<div class="wrap"><a class="crumb" href="${pre}/">← ${t.back}</a><h1>${esc(rec.n)}</h1><p class="d">${esc(rec.d[lang])}</p>
<div class="card"><dl>${row(t.buyer, esc(rec.o))}${row(t.country, rec.c ? (rec.cp ? `<a href="${pre}/country/${rec.cs}.html">${esc(rec.c)}</a>` : esc(rec.c)) : '')}${row(t.sector, `<a href="${pre}/c-${rec.t}.html"><span class="tag">${esc(rec.tl[lang])}</span></a>`)}${row(t.deadline, rec.e ? `<span class="${soon ? 'dl' : ''}">${esc(rec.e)}</span>` : '')}${row(t.pub, esc(rec.p))}${row(t.type, esc(rec.ct))}${row(t.value, esc(rec.v))}${row(t.source, `<a href="${pre}/${rec.s}.html">${esc(rec.sl[lang])}</a>`)}</dl>
<a class="btn" href="${esc(rec.u)}" target="_blank" rel="noopener nofollow">${t.view} →</a></div>
${rel.length ? `<h2>${t.related}</h2><ul class="rel">${rel.map(x => `<li><a href="${pre}/n/${x.h}">${esc(x.n)}<small>${esc([x.o, x.c, x.e].filter(Boolean).join(' · '))}</small></a></li>`).join('')}</ul>` : ''}
<p class="note">${esc(rec.cr[lang] || '')}<br>${t.note}</p></div></body></html>`);
};
