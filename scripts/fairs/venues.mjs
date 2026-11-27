// Venue-calendar crawler: finds trade-fair pages on exhibition-centre websites (COEX, KINTEX, BEXCO, EXCO ...) by itself.
// For each venue in data/fairs/venues.txt it (1) starts at the venue's listing URLs, or, if none is given, at its home page and
// follows the few links that look like schedule/exhibition lists, (2) collects detail-page links, (3) reads each detail page's
// title and "YYYY.MM.DD ~ YYYY.MM.DD" date range, (4) keeps trade-fair-looking pages and caches what it read so later runs only
// fetch new pages. Only factual fields (name, dates, venue city, URL) are stored. robots.txt is respected by the caller.
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; CBMLabBot/1.0; +https://procurement-toolkit-eight.vercel.app)', 'accept-language': 'ko,en;q=0.8' };
const pad = n => String(n).padStart(2, '0');
const ymd = (y, m, d) => { y = +y; m = +m; d = +d; if (m < 1 || m > 12 || d < 1 || d > 31) return ''; return `${y}-${pad(m)}-${pad(d)}`; };
// Date range such as "2026.11.04 - 2026.11.07", "2026.11.04(수) ~ 11.07(토)", "2026-11-04 ~ 11-07", "2026년 11월 4일 ~ 7일".
export function parseRange(t) {
  t = String(t || '').replace(/&nbsp;| /g, ' ').replace(/\s+/g, ' ');
  let m = t.match(/(20\d\d)\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})\s*(?:\([^)]{1,4}\))?\s*[~\-–—]\s*(?:(20\d\d)\s*[.\-\/]\s*)?(?:(\d{1,2})\s*[.\-\/]\s*)?(\d{1,2})(?!\d)/);
  if (m) { const s = ymd(m[1], m[2], m[3]), e = ymd(m[4] || m[1], m[5] || m[2], m[6]); if (s && e && e >= s) return { s, e }; }
  m = t.match(/(20\d\d)\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(?:\([^)]{1,4}\))?\s*[~\-–—]\s*(?:(20\d\d)\s*년\s*)?(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*일/);
  if (m) { const s = ymd(m[1], m[2], m[3]), e = ymd(m[4] || m[1], m[5] || m[2], m[6]); if (s && e && e >= s) return { s, e }; }
  return null;
}
const dec = s => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();
export function parsePage(html) {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i), ti = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  let n = dec((og && og[1]) || (h1 && h1[1].replace(/<[^>]+>/g, '')) || (ti && ti[1].replace(/<[^>]+>/g, '')));
  n = n.replace(/\s*[|\-–—·]\s*(COEX|코엑스|KINTEX|킨텍스|BEXCO|벡스코|EXCO|엑스코|SETEC|세텍|CECO|GSCO|DCC)[^|]*$/i, '').trim();
  // date: prefer the text right after the first heading, otherwise the first range in the body (scripts/styles removed)
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ').replace(/<[^>]+>/g, ' ');
  const r = parseRange(body.slice(Math.max(0, body.indexOf(n.slice(0, 12))), 6000)) || parseRange(body.slice(0, 20000));
  const ld = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].flatMap(m => { try { return [].concat(JSON.parse(m[1])); } catch { return []; } });
  const ev = ld.flatMap(x => x?.['@graph'] || x).find(x => x && /Event/.test([].concat(x['@type'] || []).join(' ')) && x.startDate);
  return { n, s: ev ? String(ev.startDate).slice(0, 10) : r?.s || '', e: ev ? String(ev.endDate || ev.startDate).slice(0, 10) : r?.e || '' };
}
const TRADE = /페스타|페스티벌|전시|위크|박람회|엑스포|페어|대전|쇼(?![가-힣])|show|expo|fair|week|week$|fest|산업전|컨벤션|메쎄|messe|forum/i;
const NOT_TRADE = /입학|편입|유학|웨딩|결혼|베이비|입시|채용|취업|학술|세미나|컨퍼런스|conference|symposium|심포지엄|콘서트|concert|워크숍|workshop|공연|오픈하우스|설명회|대회(?![가-힣])|시상|총회|포럼(?![가-힣])/i;
export const notTrade = n => NOT_TRADE.test(n);
export const looksTrade = n => n && n.length >= 4 && n.length <= 120 && TRADE.test(n) && !NOT_TRADE.test(n);
const links = (html, base) => [...new Set([...html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']([^>]*)>([\s\S]{0,200}?)<\/a>/gi)].map(m => { try { return { u: new URL(dec(m[1]), base).href, t: dec(m[3].replace(/<[^>]+>/g, '')) }; } catch { return null; } }).filter(Boolean).map(x => JSON.stringify(x)))].map(x => JSON.parse(x));
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Rows of a list/calendar page that carry both a title and a date range (detail links may be '#'/JS, as on SETEC).
export function listRows(html) {
  const rows = [];
  for (const ch0 of html.split(/<li[\s>]|<tr[\s>]|<article[\s>]/i).slice(1)) {
    const ch = ch0.replace(/^[^>]*>/, '');
    const t = ch.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    if (t.length < 8 || t.length > 400) continue;
    const r = parseRange(t); if (!r) continue;
    const m = t.search(/(기간|일시|일정|Period|Date)\s*[:：]|\d{4}\s*[.\-/년]\s*\d{1,2}/); if (m < 3) continue;
    const n = cleanName(t.slice(0, m).replace(/\s*[\d]{1,4}\s*$/, ''));
    if (n.length >= 4 && n.length <= 120) rows.push({ n, s: r.s, e: r.e });
  }
  return rows;
}

// Fallback for markup without li/tr rows: find date-range text nodes and take the nearest preceding trade-looking title node.
export function listRowsText(html) {
  const nodes = String(html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<img[^>]*\balt="([^"]*)"[^>]*>/gi, '<b>$1</b>').split(/<[^>]+>/).map(x => x.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const rows = [];
  for (let i = 0; i < nodes.length; i++) {
    const r = parseRange(nodes[i]); if (!r) continue;
    let n = ''; const own = cleanName(nodes[i].replace(/\d{4}[.\-/].*$/, '').trim());
    if (own.length >= 4 && looksTrade(own)) n = own;
    for (let j = i - 1; !n && j >= Math.max(0, i - 4); j--) { const c = cleanName(nodes[j]); if (c.length >= 4 && c.length <= 120 && looksTrade(c)) n = c; }
    if (n) rows.push({ n, s: r.s, e: r.e });
  }
  return rows;
}
const DROP_Q = new Set(['var_page', 'list_type', 'cy', 'cm', 'page', 'cPage', 'utm_source', 'utm_medium', 'utm_campaign']);
function normUrl(u) { try { const x = new URL(u.replace(/#.*$/, '')); for (const k of [...x.searchParams.keys()]) if (DROP_Q.has(k)) x.searchParams.delete(k); x.pathname = x.pathname.replace(/\/{2,}/g, '/'); return x.toString().replace(/\/\?/, '?').replace(/\?$/, ''); } catch { return u; } }
const FRONT_JUNK = /^(D-\d+|상세보기|열린|분류|전시회|EXHIBITION|EXHIBIT|전체|NEW|HOT|\d{1,3})$/i;
export function cleanName(n) {
  let t = String(n || '').replace(/^[^<>]*?>\s*/, m => (/[=\"']/.test(m) ? '' : m)).replace(/\s*[<|]\s*[A-Za-z가-힣 ]*$/, '').replace(/\s+/g, ' ').trim();
  let w = t.split(' ');
  while (w.length > 1 && FRONT_JUNK.test(w[0])) w.shift();
  t = w.join(' ').replace(/\s*(기간|일시)$/, '').trim();
  const km = t.match(/^(.*?(?:박람회|페어|쇼|전시회|엑스포|EXPO|대전|위크|페스타|페스티벌|컨벤션)\d{0,2}(?:\s*in\s*\S+|\s*\([^)]*\))?)(?:\s+\S|$)/i);
  if (km && km[1].length >= 4) t = km[1].trim();
  if (w.every(x => FRONT_JUNK.test(x)) || /^(전시홀|전시실|전시장|전시관)/.test(t)) return '';
  return /^(전시일정|행사일정|전시회 일정|일정)$/.test(t) ? '' : t;
}
async function get(u, log) { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(30000), redirect: 'follow' }); if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + u); const b = Buffer.from(await r.arrayBuffer()); const ct = r.headers.get('content-type') || ''; const cs = (ct.match(/charset=([\w-]+)/i) || [])[1] || (b.slice(0, 2000).toString('latin1').match(/charset=["']?([\w-]+)/i) || [])[1] || 'utf-8'; try { return new TextDecoder(cs).decode(b); } catch { return b.toString('utf8'); } }
const LIST_HINT = /전시|박람회|exhibit|schedule|calendar|일정|event|expo|fair|show/i;
// cfg: { id, city, cc, lists: [urls], detail: RegExp|null }
export async function crawlVenue(cfg, cache, today, { maxLists = 12, maxPages = 120, delay = 350, log = () => {} } = {}) {
  const origin = new URL(cfg.lists[0]).origin, out = [], seenList = new Set(), cand = new Map();
  let lists = cfg.lists.slice(), fetched = 0;
  const same = u => { try { return new URL(u).origin === origin; } catch { return false; } };
  for (let i = 0; i < lists.length && i < maxLists; i++) {
    if (seenList.has(lists[i])) continue; seenList.add(lists[i]);
    let html; try { html = await get(lists[i]); } catch (e) { log(`list fail ${e.message}`); continue; } await sleep(delay);
    const ls = links(html, lists[i]).filter(x => same(x.u) && !/\.(jpg|png|pdf|zip|css|js)(\?|$)/i.test(x.u));
    log(`list ${lists[i]} links=${ls.length}`);
    for (const r of [...listRows(html), ...listRowsText(html)]) if (looksTrade(r.n) && r.e >= today && (Date.parse(r.e) - Date.parse(r.s)) / 864e5 <= 14) out.push({ ...r, u: lists[i] + '#' + encodeURIComponent(r.n).slice(0, 40) });
    for (const x of ls) {
      const isDetail = cfg.detail ? cfg.detail.test(x.u) : (looksTrade(x.t) && x.t.length >= 6);
      if (isDetail) cand.set(normUrl(x.u), x.t);
      else if (!cfg.detail && cfg.lists.length === 1 && i === 0 && LIST_HINT.test(x.t + ' ' + x.u) && lists.length < maxLists) lists.push(x.u);   // one level of list discovery from the home page
      else if (cfg.detail && LIST_HINT.test(x.u) && /page|list|calendar|schedule/i.test(x.u) && lists.length < maxLists) lists.push(x.u);
    }
  }
  log(`candidates=${cand.size}`);
  for (const [u, t] of cand) {
    const c = cache[u];
    if (c && (c.skip || (c.e && c.e >= today)) && c.at === today.slice(0, 7)) { if (c.n && c.s) out.push({ ...c, u }); continue; }   // refetch at most monthly
    if (fetched >= maxPages) break; fetched++;
    try {
      const p = parsePage(await get(u)); await sleep(delay);
      const okN = x => cfg.detail ? (x && x.length >= 4 && x.length <= 120 && !NOT_TRADE.test(x)) : looksTrade(x);
      const n0 = cleanName(okN(p.n) ? p.n : (okN(t) ? t : '')), multi = p.s && p.e && p.e > p.s, n = n0 && (!cfg.detail || TRADE.test(n0) || multi) ? n0 : '';   // generic detail pages: single-day events need a trade keyword
      if (!n || !p.s || !p.e || p.e < p.s || (Date.parse(p.e) - Date.parse(p.s)) / 864e5 > 14) { cache[u] = { skip: 1, at: today.slice(0, 7) }; continue; }
      cache[u] = { n, s: p.s, e: p.e, at: today.slice(0, 7) };
      if (p.e >= today) out.push({ n, s: p.s, e: p.e, u });
    } catch (e) { log(`page fail ${e.message}`); }
  }
  log(`fetched=${fetched} kept=${out.length}`);
  return out.map(x => ({ id: `venue-${cfg.id}-${Buffer.from(x.u).toString('base64url').slice(-24)}-${x.s}`, source: 'venue:' + cfg.id, n: x.n, s: x.s, e: x.e, c: cfg.city, cc: cfg.cc, u: x.u }));
}

// iCalendar feeds published by exhibition centres (e.g. JIExpo "export events" ICS).
export function parseIcs(txt) {
  const L = String(txt || '').replace(/\r/g, '').replace(/\n[ \t]/g, '').split('\n'), out = []; let ev = null;
  const dt = v => { const m = String(v).match(/(\d{4})(\d{2})(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : ''; };
  const un = s => String(s || '').replace(/\\n/g, ' ').replace(/\\([,;\\])/g, '$1').trim();
  for (const l of L) {
    if (l.startsWith('BEGIN:VEVENT')) ev = {};
    else if (l.startsWith('END:VEVENT')) { if (ev && ev.n && ev.s) out.push(ev); ev = null; }
    else if (ev) {
      const i = l.indexOf(':'); if (i < 0) continue; const k = l.slice(0, i).split(';')[0].toUpperCase(), v = l.slice(i + 1);
      if (k === 'SUMMARY') ev.n = un(v); else if (k === 'DTSTART') ev.s = dt(v);
      else if (k === 'DTEND') { ev.e = dt(v); ev.allDay = !/T\d/.test(v); } else if (k === 'URL') ev.u = un(v);
    }
  }
  return out.map(x => { let e = x.e || x.s; if (x.allDay && x.e && x.e > x.s) { const d = new Date(x.e + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); e = d.toISOString().slice(0, 10); } return { n: x.n, s: x.s, e, u: x.u || '' }; });
}
export async function crawlIcs(cfg, today, log = () => {}) {
  const r = await fetch(cfg.url, { headers: UA, signal: AbortSignal.timeout(30000), redirect: 'follow' }); if (!r.ok) throw new Error('HTTP ' + r.status);
  const ev = parseIcs(await r.text()); log(`events=${ev.length}`);
  return ev.filter(x => x.e >= today && (Date.parse(x.e) - Date.parse(x.s)) / 864e5 <= 14 && !notTrade(x.n)).map(x => ({ id: `venue-${cfg.id}-ics-${Buffer.from(x.n + x.s).toString('base64url').slice(0, 24)}`, source: 'venue:' + cfg.id, n: x.n, s: x.s, e: x.e, c: cfg.city, cc: cfg.cc, u: x.u || cfg.url }));
}
