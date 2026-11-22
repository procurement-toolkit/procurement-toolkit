// SEO audit for the static CBM Lab pages. Zero dependencies.
// Usage: node scripts/seo/audit.mjs [--json out.json] [--md out.md]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SKIP = new Set(['privacy.html','en/privacy.html','nav-snippet.html','snippet-calculator-button.html','container-loading-calculator-en.html','email-copilot.html','naewichi_commute.html','currency-landed-cost-report.html']);
const SKIP_PREFIX = ['google','rates/','regulatory-radar/','tenders/','import-recall-radar/','category-risk-signal/','naewichi/','node_modules/','src/','public/','self-growing/','.github/','api/','supabase/'];
const BASE = 'https://procurement-toolkit-eight.vercel.app';

function listPages() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_PREFIX.some(p => (rel + '/').startsWith(p))) walk(rel); continue; }
      if (!e.name.endsWith('.html')) continue;
      if (SKIP_PREFIX.some(p => rel.startsWith(p)) || SKIP.has(rel)) continue;
      out.push(rel);
    }
  };
  walk('.');
  return out.map(p => p.replace(/^\.\//, '')).sort();
}
const strip = (s) => s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<svg[\s\S]*?<\/svg>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const attr = (re, s) => { const m = s.match(re); return m ? m[1].trim() : ''; };
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

export function auditPage(rel, html, inbound) {
  const en = rel.startsWith('en/');
  const title = decode(attr(/<title>([\s\S]*?)<\/title>/i, html));
  const desc = decode(attr(/<meta\s+name="description"\s+content="([^"]*)"/i, html));
  const canonical = attr(/<link\s+rel="canonical"\s+href="([^"]*)"/i, html);
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => strip(m[1]));
  const h2n = (html.match(/<h2\b/gi) || []).length + (html.match(/<h3\b/gi) || []).length;
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  const ldTypes = [];
  for (const m of ld) { try { const j = JSON.parse(m[1]); (Array.isArray(j) ? j : [j]).forEach(x => ldTypes.push(x['@type'])); } catch { ldTypes.push('INVALID'); } }
  const text = strip(html);
  const words = en ? text.split(/\s+/).length : text.replace(/\s/g, '').length;   // KO: characters
  const faqCount = (html.match(/class="faq-item"/g) || []).length;
  const hreflang = /hreflang="ko"/.test(html) && /hreflang="en"/.test(html);
  const og = /property="og:title"/.test(html) && /property="og:description"/.test(html);
  const imgNoAlt = (html.match(/<img\b(?![^>]*\balt=)[^>]*>/gi) || []).length;
  const outLinks = new Set([...html.matchAll(/href="([^"#?:]+\.html)"/g)].map(m => m[1]));
  const noindex = /name="robots"[^>]*noindex/i.test(html);
  const issues = [];
  const tmin = en ? 30 : 15, tmax = en ? 65 : 45;
  const dmin = en ? 90 : 50, dmax = en ? 165 : 130;
  if (!title) issues.push(['high', 'title 없음']); else if (title.length < tmin) issues.push(['med', `title 짧음(${title.length})`]); else if (title.length > tmax) issues.push(['low', `title 김(${title.length})`]);
  if (!desc) issues.push(['high', 'description 없음']); else if (desc.length < dmin) issues.push(['med', `description 짧음(${desc.length})`]); else if (desc.length > dmax) issues.push(['low', `description 김(${desc.length})`]);
  if (h1s.length !== 1) issues.push(['high', `h1 ${h1s.length}개`]);
  if (!canonical) issues.push(['high', 'canonical 없음']); else if (!canonical.startsWith(BASE)) issues.push(['med', 'canonical 도메인 불일치']);
  if (!hreflang && !SKIP.has(rel)) issues.push(['low', 'hreflang 쌍 없음']);
  if (!og) issues.push(['low', 'og 태그 부족']);
  if (!ldTypes.length) issues.push(['med', 'JSON-LD 없음']); else if (ldTypes.includes('INVALID')) issues.push(['high', 'JSON-LD 오류']);
  if (!ldTypes.includes('FAQPage') && faqCount === 0) issues.push(['med', 'FAQ 없음']);
  const tmin2 = en ? 350 : 700;
  if (words < tmin2) issues.push(['med', `본문 얇음(${words}${en ? '단어' : '자'})`]);
  if (h2n < 3) issues.push(['low', `소제목 부족(${h2n})`]);
  if (imgNoAlt) issues.push(['low', `alt 없는 이미지 ${imgNoAlt}`]);
  if ((inbound.get(rel) || 0) < 3) issues.push(['med', `내부 링크 유입 ${inbound.get(rel) || 0}개`]);
  if (outLinks.size < 3) issues.push(['low', `내부 링크 발신 ${outLinks.size}개`]);
  if (noindex) issues.push(['high', 'noindex']);
  const w = { high: 12, med: 5, low: 2 };
  const score = Math.max(0, 100 - issues.reduce((a, [s]) => a + w[s], 0));
  return { page: rel, lang: en ? 'en' : 'ko', score, title, titleLen: title.length, descLen: desc.length, h1: h1s[0] || '', words, faqCount, ldTypes, inbound: inbound.get(rel) || 0, out: outLinks.size, issues };
}

export function runAudit() {
  const pages = listPages();
  const html = new Map(pages.map(p => [p, fs.readFileSync(path.join(ROOT, p), 'utf8')]));
  const inbound = new Map();
  // inbound links also count the home page's TOOLS array (rendered by JS) and footer links
  for (const [p, h] of html) {
    const base = path.posix.dirname(p);
    const seen = new Set();
    for (const m of h.matchAll(/(?:href="|href:')([^"'#?:]+\.html)/g)) {
      const t = path.posix.normalize(path.posix.join(base === '.' ? '' : base, m[1]));
      if (t !== p && !seen.has(t)) { seen.add(t); inbound.set(t, (inbound.get(t) || 0) + 1); }
    }
  }
  return pages.map(p => auditPage(p, html.get(p), inbound));
}

if (process.argv[1] && process.argv[1].endsWith('audit.mjs')) {
  const res = runAudit();
  const get = (f) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : null; };
  const avg = Math.round(res.reduce((a, r) => a + r.score, 0) / res.length);
  const md = [`# SEO 감사 리포트`, ``, `페이지 ${res.length}개 · 평균 점수 ${avg}/100`, ``, `| 점수 | 페이지 | 주요 이슈 |`, `|---:|---|---|`,
    ...res.slice().sort((a, b) => a.score - b.score).map(r => `| ${r.score} | ${r.page} | ${r.issues.map(i => i[1]).join(', ') || '-'} |`)].join('\n');
  if (get('--json')) fs.writeFileSync(get('--json'), JSON.stringify(res, null, 1));
  if (get('--md')) fs.writeFileSync(get('--md'), md);
  if (!get('--json') && !get('--md')) console.log(md);
  else console.log(`audited ${res.length} pages, avg ${avg}`);
}
