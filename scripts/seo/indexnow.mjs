// Pings IndexNow (Bing, Naver, Yandex, Seznam; not Google) for changed pages. Key file lives at the site root.
// Usage: node scripts/seo/indexnow.mjs [--all]   (default: html/sitemap files changed in HEAD~1..HEAD)
import fs from 'fs';
import { execSync } from 'child_process';
const HOST = 'procurement-toolkit-eight.vercel.app';
const key = fs.readFileSync('data/seo/indexnow-key.txt', 'utf8').trim();
let files;
if (process.argv.includes('--all')) files = execSync("git ls-files '*.html' 'en/*.html'", { encoding: 'utf8' }).split('\n').filter(Boolean);
else files = execSync('git diff --name-only HEAD~1 HEAD', { encoding: 'utf8' }).split('\n').filter(f => /\.html$/.test(f) && !/^(google|naver)/.test(f));
const skip = /^(privacy|email-copilot|naewichi_commute)/;
const urls = files.filter(f => fs.existsSync(f) && !skip.test(f.replace(/^en\//, ''))).map(f => f === 'index.html' ? `https://${HOST}/` : `https://${HOST}/${f}`);
if (!urls.length) { console.log('indexnow: nothing changed'); process.exit(0); }
const r = await fetch('https://api.indexnow.org/IndexNow', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${key}.txt`, urlList: urls.slice(0, 10000) }) });
console.log('indexnow', r.status, urls.length, 'urls');
if (r.status >= 400) process.exit(1);
