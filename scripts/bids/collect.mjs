// Collects open public tenders/opportunities from official open APIs into data/bids/open.json (normalized).
// Sources: KR 나라장터 (data.go.kr, needs DATA_GO_KR_KEY), World Bank procurement notices, UK Contracts Finder (OCDS), EU TED v3.
// Each source is isolated: a failure never breaks the others. Raw samples are logged so field names can be adjusted from the Action log.
import fs from 'fs';
const today = new Date().toISOString().slice(0, 10);
const iso = v => { if (!v) return ''; const d = new Date(String(v).replace(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?$/, (m, a, b, c, h = '00', mi = '00') => `${a}-${b}-${c}T${h}:${mi}:00+09:00`)); return isNaN(d) ? '' : d.toISOString().slice(0, 10); };
const first = (...v) => v.find(x => x !== undefined && x !== null && x !== '') ?? '';
const txt = v => { if (v == null) return ''; if (typeof v === 'string') return v.trim(); if (Array.isArray(v)) return txt(v[0]); if (typeof v === 'object') return txt(v.ENG ?? v.eng ?? v.en ?? Object.values(v)[0]); return String(v); };
const status = {}, all = [];
async function src(name, fn) {
  try { const r = await fn(); status[name] = { ok: true, n: r.length, at: today }; all.push(...r); console.log(name, 'ok', r.length); }
  catch (e) { status[name] = { ok: false, error: String(e.message).slice(0, 200), at: today }; console.log(name, 'FAILED:', e.message); }
}
const getJSON = async (u, opt) => { const r = await fetch(u, opt); const t = await r.text(); if (!r.ok) throw new Error(`HTTP ${r.status} ${t.slice(0, 150)}`); try { return JSON.parse(t); } catch { throw new Error('not JSON: ' + t.slice(0, 200)); } };

await src('world-bank', async () => {
  const j = await getJSON('https://search.worldbank.org/api/v2/procnotices?format=json&rows=200&os=0&srt=submission_date&order=desc&apilang=en');
  const arr = Array.isArray(j.procnotices) ? j.procnotices : Object.values(j.procnotices || {});
  console.log('WB sample', JSON.stringify(arr[0] || j).slice(0, 700));
  const OPEN_WB = /invitation|request for|expression of interest|specific procurement|general procurement|bid|proposal/i;
  return arr.filter(x => !/award/i.test(x.notice_type || '') && OPEN_WB.test(x.notice_type || '') && x.submission_date && x.submission_date.slice(0,10) >= today).map(x => ({ id: 'wb-' + first(x.id, x.bid_reference_no), source: 'world-bank', title: txt(first(x.bid_description, x.project_name)), org: txt(first(x.contact_organization, x.project_name)), country: txt(x.project_ctry_name), category: txt(first(x.notice_type, x.procurement_method_name)), published: iso(x.noticedate), deadline: iso(first(x.submission_deadline_date, x.submission_date)), value: '', url: first(x.url, `https://projects.worldbank.org/en/projects-operations/procurement-detail/${x.id}`) })).filter(x => x.title);
});
await src('uk', async () => {
  const from = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 19);
  const j = await getJSON(`https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?publishedFrom=${from}&stage=tender&size=100`);
  const arr = j.releases || []; console.log('UK sample', JSON.stringify(arr[0] || j).slice(0, 700));
  return arr.filter(r => (r.tag || []).includes('tender') && r.tender?.status === 'active').map(r => ({ id: 'uk-' + r.id, source: 'uk', title: txt(r.tender?.title), org: txt(r.buyer?.name), country: 'United Kingdom', category: txt(first(r.tender?.mainProcurementCategory, r.tender?.classification?.description)), published: iso(first(r.publishedDate, r.date)), deadline: iso(r.tender?.tenderPeriod?.endDate), value: r.tender?.value?.amount ? `${Math.round(r.tender.value.amount).toLocaleString('en-GB')} ${r.tender.value.currency || 'GBP'}` : '', url: `https://www.contractsfinder.service.gov.uk/Notice/${String(r.id).split('-').slice(0, 5).join('-')}` })).filter(x => x.title);
});
await src('eu-ted', async () => {
  const d0 = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
  const j = await getJSON('https://api.ted.europa.eu/v3/notices/search', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ query: `publication-date>=${d0} AND notice-type=cn-standard`, fields: ['publication-number', 'notice-title', 'buyer-name', 'deadline-receipt-tender-date-lot', 'publication-date', 'place-of-performance-country-lot', 'links'], limit: 100, page: 1, scope: 'ACTIVE' }) });
  const ISO3 = {AUT:'AT',BEL:'BE',BGR:'BG',HRV:'HR',CYP:'CY',CZE:'CZ',DNK:'DK',EST:'EE',FIN:'FI',FRA:'FR',DEU:'DE',GRC:'GR',HUN:'HU',IRL:'IE',ITA:'IT',LVA:'LV',LTU:'LT',LUX:'LU',MLT:'MT',NLD:'NL',POL:'PL',PRT:'PT',ROU:'RO',SVK:'SK',SVN:'SI',ESP:'ES',SWE:'SE',ISL:'IS',LIE:'LI',NOR:'NO',CHE:'CH',GBR:'GB',UKR:'UA',TUR:'TR',SRB:'RS',MNE:'ME',MKD:'MK',ALB:'AL',BIH:'BA',MDA:'MD',XXK:'XK'};
  const dn = new Intl.DisplayNames(['en'], { type: 'region' });
  const cname = c => { c = txt(c); try { return ISO3[c] ? dn.of(ISO3[c]) : c; } catch { return c; } };
  const arr = j.notices || []; console.log('TED sample', JSON.stringify(arr[0] || j).slice(0, 900));
  return arr.map(n => ({ id: 'ted-' + n['publication-number'], source: 'eu-ted', title: txt(n['notice-title']), org: txt(n['buyer-name']), country: cname(n['place-of-performance-country-lot']), category: 'Contract notice', published: iso(txt(n['publication-date']).replace(/[^\d-]/g, '').slice(0, 10)), deadline: iso(txt(n['deadline-receipt-tender-date-lot']).slice(0, 10)), value: '', url: (n.links?.html?.ENG) || (n.links?.htmlDirect?.ENG) || `https://ted.europa.eu/en/notice/-/detail/${n['publication-number']}` })).filter(x => x.title);
});

await src('ungm', async () => {
  const r = await fetch('https://www.ungm.org/Public/Notice/Search', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/html', 'x-requested-with': 'XMLHttpRequest' }, body: JSON.stringify({ PageIndex: 0, PageSize: 100, Title: '', Description: '', Reference: '', PublishedFrom: '', PublishedTo: '', DeadlineFrom: today, DeadlineTo: '', Countries: [], Agencies: [], UNSPSCs: [], NoticeTypes: [], SortField: 'DatePublished', SortAscending: false, isPicker: false, IsSustainable: false, IsActive: true, NoticeDisplayType: null, NoticeSearchTotalLabelId: 'noticeSearchTotal', TypeOfCompetitions: [] }) });
  const t = await r.text(); if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + t.slice(0, 120));
  console.log('UNGM sample', t.slice(0, 1500).replace(/\s+/g, ' '));
  const out = [];
  for (const m of t.matchAll(/<div[^>]*class="[^"]*tableRow[^"]*"[^>]*data-noticeid="(\d+)"[\s\S]*?(?=<div[^>]*class="[^"]*tableRow|$)/g)) {
    const b = m[0]; const cells = [...b.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map(x => x[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    const title = (b.match(/<span[^>]*class="[^"]*ungm-title[^"]*"[^>]*>([\s\S]*?)<\/span>/) || [])[1]?.replace(/<[^>]+>/g, '').trim() || cells[0];
    const dates = [...b.matchAll(/(\d{2})-(\w{3})-(\d{4})/g)].map(x => iso(new Date(`${x[2]} ${x[1]} ${x[3]} UTC`).toISOString()));
    out.push({ id: 'ungm-' + m[1], source: 'ungm', title, org: cells[3] || '', country: cells[cells.length - 1] || '', category: 'UN notice', published: dates[1] || '', deadline: dates[0] || '', value: '', url: 'https://www.ungm.org/Public/Notice/' + m[1] });
  }
  return out.filter(x => x.title);
});
await src('au-tenders', async () => {
  const d1 = new Date().toISOString().slice(0, 19) + 'Z', d0 = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 19) + 'Z';
  const j = await getJSON(`https://api.tenders.gov.au/ocds/findByDates/contractPublished/${d0}/${d1}`);
  console.log('AU sample', JSON.stringify((j.releases || [])[0] || j).slice(0, 700));
  return (j.releases || []).map(r => ({ id: 'au-' + r.id, source: 'au-tenders', title: txt(r.tender?.title || r.contracts?.[0]?.title), org: txt(r.buyer?.name), country: 'Australia', category: txt(r.tender?.mainProcurementCategory) || 'Contract notice', published: iso(r.date), deadline: iso(r.tender?.tenderPeriod?.endDate), value: '', url: 'https://www.tenders.gov.au/Atm' })).filter(x => x.title && x.deadline);
});
await src('canada-buys', async () => {
  const r = await fetch('https://canadabuys.canada.ca/opendata/pub/openTenderNotice-ouvertAvisAppelOffres.csv'); if (!r.ok) throw new Error('HTTP ' + r.status);
  const t = await r.text(); const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { row.push(cur); cur = ''; } else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (ch !== '\r') cur += ch; }
  const h = rows[0].map(x => x.replace(/^﻿/, '')); console.log('CA headers', h.join('|').slice(0, 900));
  const ix = re => h.findIndex(x => re.test(x));
  const iT = ix(/^title-titre-eng/), iO = ix(/contractingEntityName-nomEntitContractante-eng/), iP = ix(/^publicationDate/), iD = ix(/tenderClosingDate/), iU = ix(/noticeURL-URLavis-eng/), iN = ix(/referenceNumber/), iS = ix(/tenderStatus-appelOffresStatut-eng/), iC = ix(/regionsOfDelivery-regionsLivraison-eng/);
  return rows.slice(1).filter(r => r[iT] && /open/i.test(r[iS] || 'open')).map(r => ({ id: 'ca-' + r[iN], source: 'canada-buys', title: r[iT], org: r[iO] || '', country: 'Canada', category: 'Tender notice', published: iso((r[iP] || '').slice(0, 10)), deadline: iso((r[iD] || '').slice(0, 10)), value: '', url: r[iU] || 'https://canadabuys.canada.ca' }));
});
await src('prozorro', async () => {
  const j = await getJSON('https://public-api.prozorro.gov.ua/api/2.5/tenders?descending=1&limit=100&opt_fields=title,procuringEntity,tenderPeriod,value,status,dateModified,datePublished');
  console.log('PZ sample', JSON.stringify((j.data || [])[0] || j).slice(0, 600));
  return (j.data || []).filter(x => x.status === 'active.tendering').map(x => ({ id: 'pz-' + x.id, source: 'prozorro', title: txt(x.title), org: txt(x.procuringEntity?.name), country: 'Ukraine', category: 'Tender', published: iso((x.datePublished || x.dateModified || '').slice(0, 10)), deadline: iso((x.tenderPeriod?.endDate || '').slice(0, 10)), value: x.value?.amount ? `${Math.round(x.value.amount).toLocaleString('en-GB')} ${x.value.currency}` : '', url: 'https://prozorro.gov.ua/en/tender/' + x.id })).filter(x => x.title);
});
await src('korea-g2b', async () => {
  let key = process.env.DATA_GO_KR_KEY; if (!key) throw new Error('DATA_GO_KR_KEY not set');
  if (/%[0-9A-Fa-f]{2}/.test(key)) key = decodeURIComponent(key);   // secret may hold the URL-encoded key; decode so it is not double-encoded
  const p = n => String(n).padStart(2, '0'), f = d => `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
  const now = new Date(), b = new Date(now - 3 * 864e5);
  const u = `https://apis.data.go.kr/1230000/ao/PubDataOpnStdService/getDataSetOpnStdBidPblancInfo?ServiceKey=${encodeURIComponent(key)}&numOfRows=999&pageNo=1&type=json&bidNtceBgnDt=${f(b)}&bidNtceEndDt=${f(now)}`;
  const j = await getJSON(u);
  if (j.OpenAPI_ServiceResponse) throw new Error(JSON.stringify(j.OpenAPI_ServiceResponse.cmmMsgHeader));
  let arr = j.response?.body?.items?.item || j.response?.body?.items || []; arr = Array.isArray(arr) ? arr : [arr].filter(Boolean);
  console.log('G2B sample', JSON.stringify(arr[0] || j).slice(0, 700));
  return arr.map(x => ({ id: 'kr-' + first(x.bidNtceNo, x.bidNtceNm) + '-' + first(x.bidNtceOrd, ''), source: 'korea-g2b', title: txt(x.bidNtceNm), org: txt(first(x.ntceInsttNm, x.dminsttNm)), country: '대한민국', category: txt(first(x.bsnsDivNm, x.ntceKindNm)), published: iso(first(x.bidNtceDt, x.rgstDt)), deadline: iso(x.bidClseDt), value: x.presmptPrce ? `${Number(x.presmptPrce).toLocaleString('ko-KR')}원` : '', url: first(x.bidNtceUrl, x.bidNtceDtlUrl, 'https://www.g2b.go.kr') })).filter(x => x.title);
});
// merge with previous (keep still-open items), dedupe by id, drop expired
fs.mkdirSync('data/bids', { recursive: true });
const path = 'data/bids/open.json';
const prev = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : [];
const m = new Map(); for (const x of [...prev, ...all]) m.set(x.id, x);
let out = [...m.values()].filter(x => !x.deadline || x.deadline >= today);
const cap = {}; out = out.sort((a, b) => (b.published || '').localeCompare(a.published || '')).filter(x => (cap[x.source] = (cap[x.source] || 0) + 1) <= 400);
fs.writeFileSync(path, JSON.stringify(out));
const sp = 'data/bids/status.json'; const old = fs.existsSync(sp) ? JSON.parse(fs.readFileSync(sp, 'utf8')) : {};
fs.writeFileSync(sp, JSON.stringify({ ...old, ...Object.fromEntries(Object.entries(status).map(([k, v]) => [k, v.ok ? v : { ...old[k], ...v }])) }, null, 1));
console.log('open total', out.length, JSON.stringify(Object.fromEntries(Object.keys(status).map(k => [k, out.filter(x => x.source === k).length]))));
