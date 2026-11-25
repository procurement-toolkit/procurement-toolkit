// Collects open public tenders/opportunities from official open APIs into data/bids/open.json (normalized).
// Sources: KR 나라장터 (data.go.kr, needs DATA_GO_KR_KEY), World Bank procurement notices, UK Contracts Finder (OCDS), EU TED v3.
// Each source is isolated: a failure never breaks the others. Raw samples are logged so field names can be adjusted from the Action log.
import fs from 'fs';
const today = new Date().toISOString().slice(0, 10);
const iso = v => { if (!v) return ''; const d = new Date(String(v).replace(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?$/, (m, a, b, c, h = '00', mi = '00') => `${a}-${b}-${c}T${h}:${mi}:00+09:00`)); return isNaN(d) ? '' : d.toISOString().slice(0, 10); };
const first = (...v) => v.find(x => x !== undefined && x !== null && x !== '') ?? '';
const txt = v => { if (v == null) return ''; if (typeof v === 'string') return v.trim(); if (Array.isArray(v)) return txt(v[0]); if (typeof v === 'object') return txt(v.ENG ?? v.eng ?? v.en ?? Object.values(v)[0]); return String(v); };
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; CBMLabBot/1.0; +https://procurement-toolkit-eight.vercel.app)' };
const status = {}, all = [];
async function src(name, fn) {
  try { const r = await fn(); status[name] = { ok: true, n: r.length, at: today }; all.push(...r); console.log(name, 'ok', r.length); }
  catch (e) { status[name] = { ok: false, error: String(e.message).slice(0, 200), at: today }; console.log(name, 'FAILED:', e.message); }
}
const getJSON = async (u, opt) => { const r = await fetch(u, opt); const t = await r.text(); if (!r.ok) throw new Error(`HTTP ${r.status} ${t.slice(0, 150)}`); try { return JSON.parse(t); } catch { throw new Error('not JSON: ' + t.slice(0, 200)); } };

await src('world-bank', async () => {
  const j = await getJSON('https://search.worldbank.org/api/v2/procnotices?format=json&rows=200&os=0&srt=noticedate&order=desc&apilang=en');
  const arr = Array.isArray(j.procnotices) ? j.procnotices : Object.values(j.procnotices || {});
  console.log('WB sample', JSON.stringify(arr[0] || j).slice(0, 700));
  const OPEN_WB = /invitation|request for|expression of interest|specific procurement|general procurement|bid|proposal/i;
  return arr.filter(x => !/award/i.test(x.notice_type || '') && OPEN_WB.test(x.notice_type || '') && (!x.submission_deadline_date || x.submission_deadline_date.slice(0,10) >= today)).map(x => ({ id: 'wb-' + first(x.id, x.bid_reference_no), source: 'world-bank', title: txt(first(x.bid_description, x.project_name)), org: txt(first(x.contact_organization, x.project_name)), country: txt(x.project_ctry_name), category: txt(first(x.notice_type, x.procurement_method_name)), published: iso(x.noticedate), deadline: iso(x.submission_deadline_date), value: '', url: first(x.url, `https://projects.worldbank.org/en/projects-operations/procurement-detail/${x.id}`) })).filter(x => x.title);
});
await src('uk', async () => {
  const from = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 19);
  const j = await getJSON(`https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?publishedFrom=${from}&stage=tender&size=100`);
  const arr = j.releases || []; console.log('UK sample', JSON.stringify(arr[0] || j).slice(0, 700));
  return arr.filter(r => (r.tag || []).includes('tender') && r.tender?.status === 'active').map(r => ({ id: 'uk-' + r.id, source: 'uk', title: txt(r.tender?.title), org: txt(r.buyer?.name), country: 'United Kingdom', category: txt(first(r.tender?.mainProcurementCategory, r.tender?.classification?.description)), published: iso(first(r.publishedDate, r.date)), deadline: iso(r.tender?.tenderPeriod?.endDate), value: r.tender?.value?.amount ? `${Math.round(r.tender.value.amount).toLocaleString('en-GB')} ${r.tender.value.currency || 'GBP'}` : '', url: `https://www.contractsfinder.service.gov.uk/Notice/${String(r.id).split('-').slice(0, 5).join('-')}` })).filter(x => x.title);
});
await src('eu-ted', async () => {
  const d0 = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
  const tedPage = page => getJSON('https://api.ted.europa.eu/v3/notices/search', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ query: `publication-date>=${d0} AND notice-type=cn-standard`, fields: ['publication-number', 'notice-title', 'buyer-name', 'deadline-receipt-tender-date-lot', 'publication-date', 'place-of-performance-country-lot', 'links'], limit: 250, page, scope: 'ACTIVE' }) });
  const ISO3 = {AUT:'AT',BEL:'BE',BGR:'BG',HRV:'HR',CYP:'CY',CZE:'CZ',DNK:'DK',EST:'EE',FIN:'FI',FRA:'FR',DEU:'DE',GRC:'GR',HUN:'HU',IRL:'IE',ITA:'IT',LVA:'LV',LTU:'LT',LUX:'LU',MLT:'MT',NLD:'NL',POL:'PL',PRT:'PT',ROU:'RO',SVK:'SK',SVN:'SI',ESP:'ES',SWE:'SE',ISL:'IS',LIE:'LI',NOR:'NO',CHE:'CH',GBR:'GB',UKR:'UA',TUR:'TR',SRB:'RS',MNE:'ME',MKD:'MK',ALB:'AL',BIH:'BA',MDA:'MD',XXK:'XK'};
  const dn = new Intl.DisplayNames(['en'], { type: 'region' });
  const cname = c => { c = txt(c); try { return ISO3[c] ? dn.of(ISO3[c]) : c; } catch { return c; } };
  let arr = []; for (let p = 1; p <= 4; p++) { const j = await tedPage(p); const n = j.notices || []; if (p === 1) console.log('TED sample', JSON.stringify(n[0] || j).slice(0, 300)); arr.push(...n); if (n.length < 250) break; }
  arr = arr.filter(n => { const d = txt(n['deadline-receipt-tender-date-lot']).slice(0, 10); return !d || d >= today; });
  return arr.map(n => ({ id: 'ted-' + n['publication-number'], source: 'eu-ted', title: txt(n['notice-title']?.eng ?? n['notice-title']), org: txt(n['buyer-name']), country: cname(n['place-of-performance-country-lot']), category: 'Contract notice', published: iso(txt(n['publication-date']).replace(/[^\d-]/g, '').slice(0, 10)), deadline: iso(txt(n['deadline-receipt-tender-date-lot']).slice(0, 10)), value: '', url: (n.links?.html?.ENG) || (n.links?.htmlDirect?.ENG) || `https://ted.europa.eu/en/notice/-/detail/${n['publication-number']}` })).filter(x => x.title);
});

await src('ungm', async () => {
  const pg = await fetch('https://www.ungm.org/Public/Notice', { headers: UA });
  const html = await pg.text(); const cookie = (pg.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
  const tok = (html.match(/__RequestVerificationToken[^>]*value="([^"]+)"/) || [])[1] || '';
  const post = async (PageIndex, SortField) => fetch('https://www.ungm.org/Public/Notice/Search', { method: 'POST', headers: { ...UA, 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest', referer: 'https://www.ungm.org/Public/Notice', origin: 'https://www.ungm.org', cookie, RequestVerificationToken: tok }, body: JSON.stringify({ PageIndex, PageSize: 15, Title: '', Description: '', Reference: '', PublishedFrom: '', PublishedTo: '', DeadlineFrom: '', DeadlineTo: '', Countries: [], Agencies: [], UNSPSCs: [], NoticeTypes: [], SortField, SortAscending: false, isPicker: false, IsSustainable: false, IsActive: true, NoticeDisplayType: null, NoticeSearchTotalLabelId: 'noticeSearchTotal', TypeOfCompetitions: [] }) });
  let sortF = 'DatePublished', r = await post(0, sortF);
  if (!r.ok) { sortF = 'Deadline'; r = await post(0, sortF); }
  const pages = [await r.text()]; const status0 = r.status;
  if (status0 !== 200) throw new Error('HTTP ' + status0 + ' tok=' + !!tok + ' cookie=' + !!cookie + ' ' + pages[0].slice(0, 100));
  console.log('UNGM sample', sortF, pages[0].slice(0, 1500).replace(/\s+/g, ' '));
  for (let p = 1; p < 40; p++) { const rr = await post(p, sortF); if (!rr.ok) break; const tx = await rr.text(); if (!/data-noticeid/.test(tx)) break; pages.push(tx); }
  const t = pages.join('\n');
  const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const d8 = v => { const m = String(v || '').match(/(\d{1,2})[-\s](\w{3})\w*[-\s](\d{4})/); if (!m || MON[m[2].toLowerCase()] === undefined) return ''; return new Date(Date.UTC(+m[3], MON[m[2].toLowerCase()], +m[1])).toISOString().slice(0, 10); };
  const strip = h => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
  const out = [];
  for (const blk of t.split(/(?=<div[^>]*data-noticeid=)/).slice(1)) {
    const id = (blk.match(/data-noticeid="(\d+)"/) || [])[1]; if (!id) continue;
    const cells = [...strip(blk).matchAll(/role="cell"[^>]*>([\s\S]*?)(?=<div[^>]*role="cell"|$)/g)].map(x => x[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    if (out.length === 0) console.log('UNGM cells', JSON.stringify(cells).slice(0, 900));
    const dates = cells.map(d8).filter(Boolean);
    const texts = cells.filter(c => c && !d8(c) && c.length > 3);
    out.push({ id: 'ungm-' + id, source: 'ungm', title: cells[1] || '', org: cells[4] || 'UN', country: cells[7] || '', category: cells[5] || 'UN notice', published: d8(cells[3]), deadline: d8(cells[2]), value: '', url: 'https://www.ungm.org/Public/Notice/' + id });
  }
  return out.filter(x => x.title && (!x.deadline || x.deadline >= today));
});
await src('canada-buys', async () => {
  const r = await fetch('https://canadabuys.canada.ca/opendata/pub/openTenderNotice-ouvertAvisAppelOffres.csv', { headers: UA }); if (!r.ok) throw new Error('HTTP ' + r.status);
  const t = await r.text(); const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { row.push(cur); cur = ''; } else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (ch !== '\r') cur += ch; }
  const h = rows[0].map(x => x.replace(/^﻿/, '')); console.log('CA headers', h.join('|').slice(0, 900));
  const ix = re => h.findIndex(x => re.test(x));
  const iT = ix(/^title-titre-eng/), iO = ix(/contractingEntityName-nomEntitContractante-eng/), iP = ix(/^publicationDate/), iD = ix(/tenderClosingDate/), iU = ix(/noticeURL-URLavis-eng/), iN = ix(/referenceNumber/), iS = ix(/tenderStatus-appelOffresStatut-eng/), iC = ix(/regionsOfDelivery-regionsLivraison-eng/);
  return rows.slice(1).filter(r => r[iT] && /open/i.test(r[iS] || 'open')).map(r => ({ id: 'ca-' + r[iN], source: 'canada-buys', title: r[iT], org: r[iO] || '', country: 'Canada', category: 'Tender notice', published: iso((r[iP] || '').slice(0, 10)), deadline: iso((r[iD] || '').slice(0, 10)), value: '', url: r[iU] || 'https://canadabuys.canada.ca' }));
});
await src('prozorro', async () => {
  let u = 'https://public-api.prozorro.gov.ua/api/2.5/tenders?descending=1&limit=1000&opt_fields=title,procuringEntity,tenderPeriod,value,status,datePublished', out = [];
  for (let p = 0; p < 6 && u; p++) {
    const j = await getJSON(u); const d = j.data || []; if (p === 0) console.log('PZ sample', JSON.stringify(d[0] || j).slice(0, 400));
    for (const x of d) if (/^active(\.tendering)?$/.test(x.status) && x.tenderPeriod?.endDate && x.tenderPeriod.endDate.slice(0, 10) >= today && x.title) out.push({ id: 'pz-' + x.id, source: 'prozorro', title: txt(x.title), org: txt(x.procuringEntity?.name), country: 'Ukraine', category: 'Tender', published: iso((x.datePublished || x.tenderPeriod.startDate || '').slice(0, 10)), deadline: iso(x.tenderPeriod.endDate.slice(0, 10)), value: x.value?.amount ? `${Math.round(x.value.amount).toLocaleString('en-GB')} ${x.value.currency}` : '', url: 'https://prozorro.gov.ua/en/tender/' + x.id });
    u = j.next_page?.uri && d.length ? j.next_page.uri : null;
  }
  return out;
});
await src('undp', async () => {
  const h = await (await fetch('https://procurement-notices.undp.org/', { headers: UA })).text();
  const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const d8 = v => { const m = String(v || '').match(/(\d{2})-(\w{3})-(\d{2})/); return m ? new Date(Date.UTC(2000 + +m[3], MON[m[2]], +m[1])).toISOString().slice(0, 10) : ''; };
  const out = [];
  for (const m of h.matchAll(/<a href="(view_(?:notice|negotiation)\.cfm\?[^"]+)"[^>]*vacanciesTableLink[^>]*>([\s\S]*?)<\/a>/g)) {
    const f = {}; for (const c of m[2].matchAll(/cell__label">\s*([^<]+?)\s*<\/div>\s*<span>([\s\S]*?)<\/span>/g)) f[c[1].trim()] = c[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!f.Title) continue;
    out.push({ id: 'undp-' + m[1].replace(/\D/g, ''), source: 'undp', title: f.Title, org: f['UNDP Office/Country'] || 'UNDP', country: (() => { const o = f['UNDP Office/Country'] || ''; const x = (o.includes('/') ? o.split('/').pop() : (o.split(' - ')[1] || '')).trim().toLowerCase(); return x.replace(/\b\w/g, ch => ch.toUpperCase()); })(), category: f.Process || 'UNDP notice', published: d8(f.Posted), deadline: d8(f.Deadline), value: '', url: 'https://procurement-notices.undp.org/' + m[1] });
  }
  console.log('UNDP parsed', out.length, JSON.stringify(out[0] || {}).slice(0, 300));
  return out;
});
await src('boamp-fr', async () => {
  let out = [];
  for (let p = 0; p < 6; p++) {
    const j = await getJSON(`https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records?limit=100&offset=${p * 100}&order_by=dateparution%20desc&where=${encodeURIComponent(`nature="APPEL_OFFRE" AND datelimitereponse>=date'${today}'`)}`);
    const r = j.results || []; if (p === 0) console.log('BOAMP keys', Object.keys(r[0] || {}).join(','));
    out.push(...r.map(x => ({ id: 'fr-' + x.idweb, source: 'boamp-fr', title: txt(x.objet), org: txt(x.nomacheteur), country: 'France', category: txt(x.famille_libelle), published: iso(x.dateparution), deadline: iso(String(x.datelimitereponse || '').slice(0, 10)), value: '', url: x.url_avis || `https://www.boamp.fr/pages/avis/?q=idweb:${x.idweb}` })));
    if (r.length < 100) break;
  }
  return out.filter(x => x.title);
});
await src('find-tender-uk', async () => {
  const from = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 19);
  let u = `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?stages=tender&limit=100&updatedFrom=${from}`, out = [];
  for (let p = 0; p < 4 && u; p++) {
    const j = await getJSON(u, { headers: UA }); const rel = j.releases || []; if (p === 0) console.log('FTS sample', JSON.stringify({ id: rel[0]?.id, ocid: rel[0]?.ocid, tag: rel[0]?.tag, tender: { status: rel[0]?.tender?.status, period: rel[0]?.tender?.tenderPeriod } }), 'links', JSON.stringify(j.links || {}).slice(0, 200));
    out.push(...rel.filter(r => (r.tag || []).includes('tender') && r.tender?.status === 'active').map(r => ({ id: 'fts-' + r.id, source: 'find-tender-uk', title: txt(r.tender?.title), org: txt(r.buyer?.name), country: 'United Kingdom', category: txt(r.tender?.mainProcurementCategory) || 'Tender notice', published: iso(first(r.date, r.publishedDate)), deadline: iso(r.tender?.tenderPeriod?.endDate), value: r.tender?.value?.amount ? `${Math.round(r.tender.value.amount).toLocaleString('en-GB')} ${r.tender.value.currency || 'GBP'}` : '', url: `https://www.find-tender.service.gov.uk/Notice/${String(r.id).split('-').slice(0, 2).join('-')}` })));
    u = j.links?.next || null;
  }
  return out.filter(x => x.title);
});
await src('secop-co', async () => {
  const r = await getJSON('https://www.datos.gov.co/resource/p6dx-8zbt.json?$limit=1000&$order=fecha_de_publicacion_del%20DESC');
  console.log('SECOP keys', Object.keys(r[0] || {}).join(','), 'estados', JSON.stringify([...new Set(r.map(x => x.estado_del_procedimiento))]), 'fases', JSON.stringify([...new Set(r.map(x => x.fase))]).slice(0, 300));
  return r.filter(x => !/si/i.test(x.adjudicado || 'no') && /abiert|publicad|recib/i.test(`${x.estado_del_procedimiento} ${x.fase} ${x.estado_de_apertura_del_proceso}`)).map(x => ({ id: 'co-' + x.id_del_proceso, source: 'secop-co', title: txt(x.nombre_del_procedimiento), org: txt(x.entidad), country: 'Colombia', category: txt(first(x.tipo_de_contrato, x.modalidad_de_contratacion)), published: iso(String(x.fecha_de_publicacion_del || '').slice(0, 10)), deadline: '', value: x.precio_base ? `${Number(x.precio_base).toLocaleString('en-GB')} COP` : '', url: txt(x.urlproceso?.url || x.urlproceso) || 'https://www.colombiacompra.gov.co' })).filter(x => x.title);
});
await src('korea-g2b', async () => {
  let key = process.env.DATA_GO_KR_KEY; if (!key) throw new Error('DATA_GO_KR_KEY not set');
  if (/%[0-9A-Fa-f]{2}/.test(key)) key = decodeURIComponent(key);   // secret may hold the URL-encoded key; decode so it is not double-encoded
  const p = n => String(n).padStart(2, '0'), f = d => `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
  const now = new Date(), b = new Date(now - 3 * 864e5);
  let arr = [];
  for (const op of ['Thng', 'Servc', 'Cnstwk', 'Frgcpt']) {
    try {
      const u = `https://apis.data.go.kr/1230000/ad/BidPublicInfoService02/getBidPblancListInfo${op}02?ServiceKey=${encodeURIComponent(key)}&numOfRows=300&pageNo=1&inqryDiv=1&type=json&inqryBgnDt=${f(b)}&inqryEndDt=${f(now)}`;
      const j = await getJSON(u);
      if (j.OpenAPI_ServiceResponse) throw new Error(JSON.stringify(j.OpenAPI_ServiceResponse.cmmMsgHeader));
      let it = j.response?.body?.items?.item || j.response?.body?.items || []; it = Array.isArray(it) ? it : [it].filter(Boolean);
      console.log('G2B', op, it.length, JSON.stringify(it[0] || j).slice(0, 300));
      arr.push(...it.map(x => ({ ...x, bsnsDivNm: x.bsnsDivNm || ({ Thng: '물품', Servc: '용역', Cnstwk: '공사', Frgcpt: '외자' })[op] })));
    } catch (e) { console.log('G2B', op, 'fail', String(e.message).slice(0, 200)); }
  }
  if (!arr.length) throw new Error('G2B: no items');
  return arr.map(x => ({ id: 'kr-' + first(x.bidNtceNo, x.bidNtceNm) + '-' + first(x.bidNtceOrd, ''), source: 'korea-g2b', title: txt(x.bidNtceNm), org: txt(first(x.ntceInsttNm, x.dminsttNm)), country: '대한민국', category: txt(first(x.bsnsDivNm, x.ntceKindNm)), published: iso(first(x.bidNtceDt, x.rgstDt)), deadline: iso(x.bidClseDt), value: (x.presmptPrce||x.asignBdgtAmt) ? `${Number(x.presmptPrce||x.asignBdgtAmt).toLocaleString('ko-KR')}원` : '', url: first(x.bidNtceUrl, x.bidNtceDtlUrl, 'https://www.g2b.go.kr') })).filter(x => x.title);
});
await src('sam-gov', async () => {
  const key = process.env.SAM_GOV_API_KEY; if (!key) throw new Error('SAM_GOV_API_KEY not set');
  const p = n => String(n).padStart(2, '0'), f = d => `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}`;
  const now = new Date(), b = new Date(now - 7 * 864e5);
  const j = await getJSON(`https://api.sam.gov/opportunities/v2/search?api_key=${encodeURIComponent(key)}&limit=1000&offset=0&postedFrom=${f(b)}&postedTo=${f(now)}&ptype=o,k,p`);
  const arr = j.opportunitiesData || [];
  console.log('SAM', arr.length, JSON.stringify(arr[0] || j).slice(0, 300));
  return arr.map(x => ({ id: 'us-' + x.noticeId, source: 'sam-gov', title: txt(x.title), org: txt(first(x.fullParentPathName, x.department)).split('.').slice(0, 2).join(' · '), country: 'United States', category: txt(first(x.type, x.baseType)), published: iso(String(x.postedDate || '').slice(0, 10)), deadline: iso(String(x.responseDeadLine || '').slice(0, 10)), value: x.award?.amount ? `$${Number(x.award.amount).toLocaleString('en-US')}` : '', url: txt(x.uiLink) || 'https://sam.gov' })).filter(x => x.title);
});
// merge with previous (keep still-open items), dedupe by id, drop expired
fs.mkdirSync('data/bids', { recursive: true });
const path = 'data/bids/open.json';
const prev = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : [];
const m = new Map(); for (const x of [...prev, ...all]) m.set(x.id, x);
let out = [...m.values()].filter(x => !x.deadline || x.deadline >= today);
const cap = {}; out = out.sort((a, b) => (b.published || '').localeCompare(a.published || '')).filter(x => (cap[x.source] = (cap[x.source] || 0) + 1) <= 1500);
// bilingual titles: cached machine translation (English + Korean) of notice titles; newest first, capped per run
const trPath = 'data/bids/tr.json';
const TR = fs.existsSync(trPath) ? JSON.parse(fs.readFileSync(trPath, 'utf8')) : {};
const isEn = s => !/[^\x00-\x7f]/.test(s) && /\b(the|and|of|for|to|in|services?|supply|works?|procurement|contract|consult\w*|support|project)\b/i.test(s);
const hasKo = s => /[가-힣]/.test(s);
async function gt(text, tl) {
  const r = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(text.slice(0, 400))}`, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json(); return { t: (j[0] || []).map(a => a[0]).join('').trim(), l: j[2] };
}
const CAP = 2500; let done = 0, fails = 0, streak = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function gtRetry(text, tl) { try { return await gt(text, tl); } catch (e) { if (/429/.test(String(e.message))) { await sleep(45000); return await gt(text, tl); } throw e; } }
const todo = out.filter(x => !(TR[x.id]) && x.title).slice(0, CAP);
const T0 = Date.now(), BUDGET = 40 * 60e3;   // keep the daily run short; the cache catches up over several days
for (const x of todo) {
  if (streak >= 5 || Date.now() - T0 > BUDGET) break;
  await sleep(1500);
  const e = {};
  try {
    if (hasKo(x.title)) { e.k = x.title; e.e = (await gtRetry(x.title, 'en')).t; }
    else if (isEn(x.title)) { e.e = x.title; await sleep(1200); e.k = (await gtRetry(x.title, 'ko')).t; }
    else { const en = await gtRetry(x.title, 'en'); e.e = en.l === 'en' ? x.title : en.t; await sleep(1200); e.k = (await gtRetry(e.e, 'ko')).t; }
    TR[x.id] = e; done++; streak = 0;
  } catch (err) { fails++; streak++; if (fails <= 3) console.log('translate error', String(err.message || err).slice(0, 160)); }
}
console.log('translated', done, 'failed', fails, 'cache', Object.keys(TR).length);
const live = new Set(out.map(x => x.id)); for (const k of Object.keys(TR)) if (!live.has(k)) delete TR[k];
fs.writeFileSync(trPath, JSON.stringify(TR));
for (const x of out) if (TR[x.id]) { x.te = TR[x.id].e; x.tk = TR[x.id].k; }
fs.writeFileSync(path, JSON.stringify(out));
const sp = 'data/bids/status.json'; const old = fs.existsSync(sp) ? JSON.parse(fs.readFileSync(sp, 'utf8')) : {};
fs.writeFileSync(sp, JSON.stringify({ ...old, ...Object.fromEntries(Object.entries(status).map(([k, v]) => [k, v.ok ? v : { ...old[k], ...v }])) }, null, 1));
console.log('open total', out.length, JSON.stringify(Object.fromEntries(Object.keys(status).map(k => [k, out.filter(x => x.source === k).length]))));
