// Appends a long-form, sourced guide section to tool pages (idempotent, marker-delimited).
// Content lives in seo/content/*.mjs as { file: 'cbm.html', lang: 'ko', updated: '2026-11', h: 'heading', lead: '...', sections: [{h, p:[], ul:[], ol:[], table:[[...]]}], sources: [[name,url]] }
import fs from 'fs';
const BASE = 'https://procurement-toolkit-eight.vercel.app';
const CSS = `<style>.seo-guide{max-width:880px;margin:40px auto 24px;padding:28px 24px;background:#fff;border:1px solid rgba(15,23,42,.12);border-radius:14px;box-shadow:0 1px 2px rgba(15,23,42,.06),0 6px 18px -10px rgba(15,23,42,.25);color:#1e293b;font-size:15.5px;line-height:1.85;word-break:keep-all;overflow-wrap:break-word}.seo-guide h2{font-size:1.45rem;line-height:1.35;margin:0 0 12px;color:#0f172a}.seo-guide h3{font-size:1.1rem;margin:28px 0 8px;color:#0f172a;padding-left:10px;border-left:4px solid #2563eb}.seo-guide p{margin:10px 0}.seo-guide ul,.seo-guide ol{margin:10px 0;padding-left:22px}.seo-guide li{margin:5px 0}.seo-guide .lead{font-size:16.5px;color:#334155}.seo-guide table{width:100%;border-collapse:collapse;margin:14px 0;font-size:14.5px;display:block;overflow-x:auto}.seo-guide th,.seo-guide td{border:1px solid rgba(15,23,42,.14);padding:8px 10px;text-align:left;vertical-align:top}.seo-guide th{background:#f1f5f9}.seo-guide .src{margin-top:26px;padding-top:14px;border-top:1px solid rgba(15,23,42,.12);font-size:13.5px;color:#475569}.seo-guide .src a{color:#1d4ed8}.seo-guide .upd{font-size:12.5px;color:#64748b;margin-top:10px}.seo-guide code{background:#f1f5f9;padding:1px 6px;border-radius:5px;font-size:.92em}@media(max-width:600px){.seo-guide{margin:24px 12px;padding:20px 16px}}</style>`;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inl = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
export function render(c) {
  const sec = c.sections.map(s => `<h3>${esc(s.h)}</h3>${(s.p || []).map(p => `<p>${inl(p)}</p>`).join('')}${s.ul ? `<ul>${s.ul.map(x => `<li>${inl(x)}</li>`).join('')}</ul>` : ''}${s.ol ? `<ol>${s.ol.map(x => `<li>${inl(x)}</li>`).join('')}</ol>` : ''}${s.table ? `<table><thead><tr>${s.table[0].map(x => `<th>${inl(x)}</th>`).join('')}</tr></thead><tbody>${s.table.slice(1).map(r => `<tr>${r.map(x => `<td>${inl(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''}${(s.p2 || []).map(p => `<p>${inl(p)}</p>`).join('')}`).join('');
  const src = c.sources?.length ? `<div class="src"><strong>${c.lang === 'ko' ? '참고한 공식 자료' : 'Official references'}</strong><ul>${c.sources.map(([n, u]) => `<li><a href="${u}" rel="noopener" target="_blank">${esc(n)}</a></li>`).join('')}</ul></div>` : '';
  const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: c.h, inLanguage: c.lang, dateModified: c.updated + '-01', author: { '@type': 'Organization', name: 'CBM Lab' }, publisher: { '@type': 'Organization', name: 'CBM Lab' }, mainEntityOfPage: `${BASE}/${c.file}` };
  return `<!--SEOGUIDE-->${CSS}<section class="seo-guide" lang="${c.lang}" aria-label="${esc(c.h)}"><h2>${esc(c.h)}</h2><p class="lead">${inl(c.lead)}</p>${sec}${src}<p class="upd">${c.lang === 'ko' ? `기준: ${c.updated.replace('-', '년 ')}월. 제도와 요율은 바뀔 수 있으니 실제 거래 전 공식 자료로 확인하세요.` : `As of ${c.updated}. Rules and rates change, so confirm with the official sources before you transact.`}</p><script type="application/ld+json">${JSON.stringify(ld)}</script></section><!--/SEOGUIDE-->`;
}
const dir = 'seo/content';
let n = 0;
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.mjs'))) {
  const mod = await import(`../../${dir}/${f}`);
  for (const c of mod.default) {
    if (!fs.existsSync(c.file)) { console.log('missing page', c.file); continue; }
    let s = fs.readFileSync(c.file, 'utf8');
    s = s.replace(/<!--SEOGUIDE-->[\s\S]*?<!--\/SEOGUIDE-->\n?/, '');
    const html = render(c) + '\n';
    const at = s.indexOf('<!--RELATED-->') >= 0 ? s.indexOf('<!--RELATED-->') : s.search(/<footer/);
    if (at < 0) { console.log('no anchor', c.file); continue; }
    s = s.slice(0, at) + html + s.slice(at);
    fs.writeFileSync(c.file, s); n++;
  }
}
console.log('enriched', n, 'pages');
