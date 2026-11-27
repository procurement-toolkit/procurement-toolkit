// Collects upcoming trade fairs from open / organizer-published sources into data/fairs/auto.json (normalized).
// Same shape as scripts/bids/collect.mjs: every source is isolated (one failure never breaks the others), status goes to
// data/fairs/status.json, raw samples are logged so field names can be adjusted from the Action log.
// Sources: Wikidata (CC0, SPARQL), ITA Trade Events API (public domain, optional ITA_API_KEY),
//          organizer pages that publish schema.org Event JSON-LD (list in data/fairs/sources.txt; robots.txt is respected).
// Curated entries (data/fairs/fairs.txt) always win over auto entries in build.mjs.
import fs from 'fs';
const today = new Date().toISOString().slice(0, 10);
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; CBMLabBot/1.0; +https://procurement-toolkit-eight.vercel.app)' };
const status = {}, all = [];
const d10 = v => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : ''; };
const txt = v => { if (v == null) return ''; if (typeof v === 'string') return v.trim(); if (Array.isArray(v)) return txt(v[0]); if (typeof v === 'object') return txt(v.name ?? v['@value'] ?? ''); return String(v); };
const NOT_FAIR = /\bexpo\s*20\d\d\b|horticultur|world'?s fair|olympi|festival|concert|marathon/i;
async function src(name, fn) {
  try { const r = await fn(); status[name] = { ok: true, n: r.length, at: today }; all.push(...r); console.log(name, 'ok', r.length); }
  catch (e) { status[name] = { ok: false, error: String(e.message).slice(0, 200), at: today }; console.log(name, 'FAILED:', e.message); }
}
const getJSON = async (u, opt) => { const r = await fetch(u, { ...opt, signal: AbortSignal.timeout(60000) }); const t = await r.text(); if (!r.ok) throw new Error(`HTTP ${r.status} ${t.slice(0, 150)}`); try { return JSON.parse(t); } catch { throw new Error('not JSON: ' + t.slice(0, 200)); } };
const norm = x => ({ ...x, n: x.n.replace(/\s+/g, ' ').trim(), c: (x.c || '').replace(/\s+/g, ' ').trim() });
const valid = x => x.n && x.n.length >= 4 && x.c && /^\d{4}-\d{2}-\d{2}$/.test(x.s) && /^\d{4}-\d{2}-\d{2}$/.test(x.e) && x.e >= x.s && x.e >= today && (Date.parse(x.e) - Date.parse(x.s)) / 864e5 <= 14 && !NOT_FAIR.test(x.n);

// ---- Wikidata (CC0) -----------------------------------------------------------------------------
await src('wikidata', async () => {
  const q = `SELECT ?e ?eLabel ?s ?en ?cityLabel ?cc ?web WHERE {
    { ?e wdt:P31/wdt:P279* wd:Q57305 } UNION { ?e wdt:P31 wd:Q464980. ?e rdfs:label ?lb. FILTER(LANG(?lb) = "en" && REGEX(?lb, "expo|fair|show|messe|trade|salon|exhibition|fiera|feria|foire", "i")) }
    { ?e wdt:P580 ?s } UNION { ?e wdt:P585 ?s }  FILTER(?s >= NOW())
    OPTIONAL { ?e wdt:P582 ?en } OPTIONAL { ?e wdt:P856 ?web }
    OPTIONAL { ?e wdt:P276 ?city. OPTIONAL { ?city wdt:P17 ?k. ?k wdt:P297 ?cc } }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 2000`;
  const j = await getJSON('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { headers: { ...UA, accept: 'application/sparql-results+json' } });
  const b = j.results?.bindings || []; console.log('WD sample', JSON.stringify(b[0] || j).slice(0, 400));
  const out = new Map();
  for (const r of b) {
    const n = r.eLabel?.value || ''; if (/^Q\d+$/.test(n)) continue;
    const s = d10(r.s?.value), e = d10(r.en?.value) || s;
    const x = norm({ id: 'wd-' + r.e.value.split('/').pop(), source: 'wikidata', n, s, e, c: r.cityLabel?.value && !/^Q\d+$/.test(r.cityLabel.value) ? r.cityLabel.value : '', cc: r.cc?.value || '', u: r.web?.value || '' });
    if (valid(x) && x.u) out.set(x.n.toLowerCase() + '|' + x.s, x);       // official website required
  }
  return [...out.values()];
});

// ---- ITA Trade Events API (public domain; free key from developer.trade.gov) ------------------------
await src('ita-events', async () => {
  const key = process.env.ITA_API_KEY; if (!key) throw new Error('ITA_API_KEY not set');
  const j = await getJSON(`https://data.trade.gov/trade_events/v1/search?size=100&start_date_range%5Bfrom%5D=${today}`, { headers: { ...UA, 'subscription-key': key } });
  const arr = j.results || j.data || []; console.log('ITA sample', JSON.stringify(arr[0] || j).slice(0, 500));
  return arr.map(r => norm({ id: 'ita-' + (r.id || r.event_id), source: 'ita-events', n: txt(r.event_name || r.title), s: d10(r.start_date), e: d10(r.end_date || r.start_date), c: txt(r.city), cc: txt(r.country_code || '').slice(0, 2).toUpperCase(), u: r.registration_link || r.event_url || '' })).filter(valid);
});

// ---- organizer pages with schema.org Event JSON-LD ---------------------------------------------------
// data/fairs/sources.txt: one organizer event-calendar URL per line (optional `|default city|country code`). Only pages whose
// robots.txt allows crawling are read, and only factual fields (name, dates, place, URL) are taken.
async function robotsOk(u) {
  try {
    const o = new URL(u); const r = await fetch(o.origin + '/robots.txt', { headers: UA, signal: AbortSignal.timeout(15000) }); if (!r.ok) return true;
    let all = false, dis = []; for (const l of (await r.text()).split('\n')) { const m = l.match(/^\s*(user-agent|disallow)\s*:\s*(.*?)\s*(#.*)?$/i); if (!m) continue; if (/user-agent/i.test(m[1])) all = m[2] === '*'; else if (all && m[2]) dis.push(m[2]); }
    return !dis.some(p => o.pathname.startsWith(p));
  } catch { return true; }
}
const walk = (o, f) => { if (Array.isArray(o)) o.forEach(v => walk(v, f)); else if (o && typeof o === 'object') { f(o); Object.values(o).forEach(v => walk(v, f)); } };
const srcFile = 'data/fairs/sources.txt';
const SRC_FILE_LINES = fs.existsSync(srcFile) ? fs.readFileSync(srcFile, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')) : [];
// Self-discovery: every day, re-read a rotating slice of the curated fairs' own official sites. A different edition of the
// same fair (name shares a distinctive word with the curated entry) found there as schema.org Event JSON-LD is added as an
// auto entry. Curated entries always win on name+start, so this only ever adds new editions, never overwrites checked data.
const DISC = (() => { try {
  const seen = new Set(), rows = [];
  for (const l of fs.readFileSync('data/fairs/fairs.txt', 'utf8').split('\n')) {
    const p = l.split('|').map(x => x.trim()); if (p.length < 6 || !/^https?:\/\//.test(p[5])) continue;
    let h; try { h = new URL(p[5]).origin; } catch { continue; } if (seen.has(h)) continue; seen.add(h);
    rows.push(`${p[5]}|${p[3]}|${/^[A-Z]{2}$/.test(p[6] || '') ? p[6] : ''}|${p[0]}`);
  }
  const day = Math.floor(Date.now() / 864e5), N = 40, off = (day * N) % Math.max(rows.length, 1);
  return rows.concat(rows).slice(off, off + N);
} catch { return []; } })();
const SRC_LINES = [...SRC_FILE_LINES, ...DISC];
for (const line of SRC_LINES) {
  const [url, dc = '', dcc = '', mt = ''] = line.split('|').map(x => x.trim());
  await src((mt ? 'disc:' : 'ld:') + new URL(url).hostname, async () => {
    if (!(await robotsOk(url))) throw new Error('robots.txt disallows');
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error('HTTP ' + r.status);
    const html = await r.text(), out = [];
    for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      let j; try { j = JSON.parse(m[1]); } catch { continue; }
      walk(j, o => {
        const t = [].concat(o['@type'] || []).join(' '); if (!/Event|TradeShow|ExhibitionEvent/.test(t) || !o.startDate) return;
        const loc = [].concat(o.location || [])[0] || {}, ad = loc.address || {};
        const x = norm({ id: 'ld-' + new URL(url).hostname + '-' + txt(o.name).toLowerCase().replace(/\W+/g, '-').slice(0, 60) + '-' + d10(o.startDate), source: 'ld:' + new URL(url).hostname, n: txt(o.name), s: d10(o.startDate), e: d10(o.endDate) || d10(o.startDate), c: txt(ad.addressLocality) || dc, cc: (/^[A-Za-z]{2}$/.test(txt(ad.addressCountry)) ? txt(ad.addressCountry) : dcc).toUpperCase(), u: txt(o.url) ? new URL(txt(o.url), url).href : url });
        if (valid(x)) out.push(x);
      });
    }
    if (mt) { const ws = mt.toLowerCase().split(/[^a-z0-9가-힣]+/).filter(w => w.length >= 5 && !/^20\d\d$/.test(w)); const k = out.filter(x => ws.some(w => x.n.toLowerCase().includes(w))); out.length = 0; out.push(...k); }
    console.log('LD', url, out.length, JSON.stringify(out[0] || {}).slice(0, 300));
    return out;
  });
}

// ---- exhibition-centre calendars (self-discovering crawler, see venues.mjs) ---------------------------------------
import { crawlVenue, crawlIcs, looksTrade } from './venues.mjs';
const VC_PATH = 'data/fairs/venue-cache.json';
const vcache = fs.existsSync(VC_PATH) ? JSON.parse(fs.readFileSync(VC_PATH, 'utf8')) : {};
const VLINES = fs.existsSync('data/fairs/venues.txt') ? fs.readFileSync('data/fairs/venues.txt', 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')) : [];
for (const line of VLINES) {
  const [id, city, cc, lists, det] = line.split('|').map(x => x.trim());
  const ls = [...new Set((lists || '').split(',').map(x => x.trim()).filter(Boolean).flatMap(u => /\{(Y|YM)\}/.test(u) ? Array.from({ length: 14 }, (_, k) => { const d = new Date(today + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + k, 1); return u.replaceAll('{YM}', d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0')).replace('{Y}', d.getUTCFullYear()).replace('{M}', d.getUTCMonth() + 1); }) : [u]))]; if (!id || !ls.length) continue;
  await src('venue:' + id, async () => {
    if (!(await robotsOk(ls[0]))) throw new Error('robots.txt disallows');
    return (await crawlVenue({ id, city, cc, lists: ls, detail: det ? new RegExp(det) : null }, vcache, today, { log: m => console.log('  [' + id + ']', m) })).filter(valid);
  });
}

// iCalendar feeds: data/fairs/ics.txt  ->  id|city|CC|url
const ILINES = fs.existsSync('data/fairs/ics.txt') ? fs.readFileSync('data/fairs/ics.txt', 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')) : [];
for (const line of ILINES) {
  const [id, city, cc, url] = line.split('|').map(x => x.trim()); if (!id || !url) continue;
  await src('venue:' + id, async () => !(await robotsOk(url)) ? (() => { throw new Error('robots.txt disallows'); })() : (await crawlIcs({ id, city, cc, url }, today, m => console.log('  [' + id + ']', m))).filter(valid));
}
fs.mkdirSync('data/fairs', { recursive: true }); fs.writeFileSync(VC_PATH, JSON.stringify(vcache));

// ---- Korea Tourism Organization event API (data.go.kr, free key: DATA_GO_KR_KEY) --------------------------------
const KCITY = { 서울: 'Seoul', 부산: 'Busan', 대구: 'Daegu', 인천: 'Incheon', 광주: 'Gwangju', 대전: 'Daejeon', 울산: 'Ulsan', 세종: 'Sejong', 고양: 'Goyang', 성남: 'Seongnam', 수원: 'Suwon', 용인: 'Yongin', 화성: 'Hwaseong', 창원: 'Changwon', 제주: 'Jeju', 평택: 'Pyeongtaek', 김해: 'Gimhae', 청주: 'Cheongju', 전주: 'Jeonju', 경주: 'Gyeongju', 안산: 'Ansan', 파주: 'Paju', 군산: 'Gunsan', 포항: 'Pohang', 구미: 'Gumi' };
if (process.env.DATA_GO_KR_KEY) await src('tourapi', async () => {
  const ymd = today.replace(/-/g, ''), out = [];
  for (let page = 1; page <= 6; page++) {
    const u = `https://apis.data.go.kr/B551011/KorService2/searchFestival2?serviceKey=${encodeURIComponent(process.env.DATA_GO_KR_KEY)}&MobileOS=ETC&MobileApp=CBMLab&_type=json&eventStartDate=${ymd}&numOfRows=500&pageNo=${page}&arrange=A`;
    const j = await getJSON(u, { headers: UA }); const items = [].concat(j.response?.body?.items?.item || []);
    if (page === 1) console.log('TOUR sample', JSON.stringify(items[0] || j).slice(0, 500));
    for (const it of items) {
      const n = String(it.title || '').trim(), s = d10(String(it.eventstartdate || '').replace(/^(\d{4})(\d{2})(\d{2}).*/, '$1-$2-$3')), e = d10(String(it.eventenddate || '').replace(/^(\d{4})(\d{2})(\d{2}).*/, '$1-$2-$3')) || s;
      const toks = String(it.addr1 || '').split(/\s+/), city = KCITY[(toks[0] || '').slice(0, 2)] || KCITY[(toks[1] || '').slice(0, 2)] || '';
      if (!looksTrade(n) || !city) continue;
      const x = norm({ id: 'tour-' + (it.contentid || n) + '-' + s, source: 'tourapi', n, s, e, c: city, cc: 'KR', u: '' });
      if (valid(x)) out.push(x);
    }
    if (items.length < 500) break;
  }
  return out;
});

// ---- merge with previous (keep still-upcoming items), dedupe, drop ended ----------------------------
fs.mkdirSync('data/fairs', { recursive: true });
const path = 'data/fairs/auto.json';
const prev = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : [];
const m = new Map(); for (const x of [...prev, ...all]) m.set(x.id, x);
const out = [...m.values()].filter(x => x.e >= today).sort((a, b) => a.s.localeCompare(b.s) || a.n.localeCompare(b.n));
fs.writeFileSync(path, JSON.stringify(out));
const sp = 'data/fairs/status.json'; const old = fs.existsSync(sp) ? JSON.parse(fs.readFileSync(sp, 'utf8')) : {};
fs.writeFileSync(sp, JSON.stringify({ ...old, ...Object.fromEntries(Object.entries(status).map(([k, v]) => [k, v.ok ? v : { ...old[k], ...v }])) }, null, 1));
console.log('auto total', out.length, JSON.stringify(Object.fromEntries(Object.keys(status).map(k => [k, out.filter(x => x.source === k).length]))));
