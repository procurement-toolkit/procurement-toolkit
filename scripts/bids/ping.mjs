// After a deploy: IndexNow-ping new tender URLs (KO+EN), and write a health report. Exits non-zero if collection looks broken.
import fs from 'fs';
const HOST = 'procurement-toolkit-eight.vercel.app';
const key = fs.readFileSync('data/seo/indexnow-key.txt', 'utf8').trim();
const pub = JSON.parse(fs.readFileSync('data/bids/pub.json', 'utf8'));
const status = fs.existsSync('data/bids/status.json') ? JSON.parse(fs.readFileSync('data/bids/status.json', 'utf8')) : {};
const pp = 'data/bids/pinged.json';
const seen = new Set(fs.existsSync(pp) ? JSON.parse(fs.readFileSync(pp, 'utf8')) : []);
const fresh = pub.filter(x => !seen.has(x.h));
const urls = [`https://${HOST}/bids/`, `https://${HOST}/en/bids/`];
for (const x of fresh.slice(0, 4900)) urls.push(`https://${HOST}/bids/n/${x.h}`, `https://${HOST}/en/bids/n/${x.h}`);
const r = await fetch('https://api.indexnow.org/IndexNow', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${key}.txt`, urlList: urls }) });
console.log('indexnow', r.status, urls.length, 'urls,', fresh.length, 'new notices');
if (r.status < 300) fs.writeFileSync(pp, JSON.stringify(pub.map(x => x.h)));
const bySource = {}; for (const x of pub) bySource[x.s] = (bySource[x.s] || 0) + 1;
const failed = Object.entries(status).filter(([, v]) => !v.ok).map(([k, v]) => `${k}: ${v.error}`);
fs.writeFileSync('data/bids/health.json', JSON.stringify({ at: new Date().toISOString().slice(0, 10), total: pub.length, bySource, failedSources: failed }, null, 1));
console.log('health', pub.length, JSON.stringify(bySource), 'failed:', failed.join(' | '));
if (pub.length < 100) { console.error('collection looks broken (<100 notices)'); process.exit(1); }
