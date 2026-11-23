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
const TRADE = /전시|위크|박람회|엑스포|페어|대전|쇼(?![가-힣])|show|expo|fair|week|week$|fest|산업전|컨벤션|메쎄|messe|forum/i;
const NOT_TRADE = /유학|웨딩|결혼|베이비|입시|채용|취업|학술|세미나|컨퍼런스|conference|symposium|심포지엄|콘서트|concert|워크숍|workshop|공연|오픈하우스|설명회|대회(?![가-힣])|시상|총회|포럼(?![가-힣])/i;
export const notTrade = n => NOT_TRADE.test(n);
export const looksTrade = n => n && n.length >= 4 && n.length <= 120 && TRADE.test(n) && !NOT_TRADE.test(n);
const links = (html, base) => [...new Set([...html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']([^>]*)>([\s\S]{0,200}?)<\/a>/gi)].map(m => { try { return { u: new URL(dec(m[1]), base).href, t: dec(m[3].replace(/<[^>]+>/g, '')) }; } catch { return null; } }).filter(Boolean).map(x => JSON.stringify(x)))].map(x => JSON.parse(x));
const sleep = ms => new Promise(r => setTimeout(r, ms));
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
    for (const x of ls) {
      const isDetail = cfg.detail ? cfg.detail.test(x.u) : (looksTrade(x.t) && x.t.length >= 6);
      if (isDetail) cand.set(x.u.replace(/#.*$/, ''), x.t);
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
      const n = okN(p.n) ? p.n : (okN(t) ? t : '');
      if (!n || !p.s || !p.e || p.e < p.s || (Date.parse(p.e) - Date.parse(p.s)) / 864e5 > 14) { cache[u] = { skip: 1, at: today.slice(0, 7) }; continue; }
      cache[u] = { n, s: p.s, e: p.e, at: today.slice(0, 7) };
      if (p.e >= today) out.push({ n, s: p.s, e: p.e, u });
    } catch (e) { log(`page fail ${e.message}`); }
  }
  log(`fetched=${fetched} kept=${out.length}`);
  return out.map(x => ({ id: `venue-${cfg.id}-${Buffer.from(x.u).toString('base64url').slice(-24)}-${x.s}`, source: 'venue:' + cfg.id, n: x.n, s: x.s, e: x.e, c: cfg.city, cc: cfg.cc, u: x.u }));
}
