// Builds rss.xml (RSS 2.0) from the fair data: upcoming fairs, newest-opening first. Submitted to Naver Search Advisor / readers.
import fs from 'node:fs';
const BASE = 'https://procurement-toolkit-eight.vercel.app', today = new Date().toISOString().slice(0, 10);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const d = JSON.parse(fs.readFileSync('fairs/data.json', 'utf8')).filter(f => f.e >= today).sort((a, b) => a.s.localeCompare(b.s)).slice(0, 100);
const rfc = x => new Date(x + 'T00:00:00Z').toUTCString();
const items = d.map(f => `<item><title>${esc(f.n)} (${f.s}${f.e !== f.s ? ' ~ ' + f.e : ''}, ${esc(f.pl)})</title><link>${BASE}/fairs/f/${f.h}.html</link><guid isPermaLink="true">${BASE}/fairs/f/${f.h}.html</guid><description>${esc(`${f.pl}에서 ${f.s}${f.e !== f.s ? '부터 ' + f.e + '까지' : ''} 열리는 ${f.n} 전시회 일정 정보입니다. 분야: ${f.gl}.`)}</description><category>${esc(f.gl)}</category><pubDate>${rfc(today)}</pubDate></item>`).join('\n');
fs.writeFileSync('rss.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>CBM Lab 전시회 일정</title><link>${BASE}/fairs/</link><description>세계·국내 전시회 개최 일정. 공식 일정 기준으로 매일 갱신합니다.</description><language>ko</language><lastBuildDate>${rfc(today)}</lastBuildDate>\n${items}\n</channel></rss>\n`);
console.log(`rss: ${d.length} items`);
