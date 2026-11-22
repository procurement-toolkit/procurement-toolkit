// Tracks Google index status per sitemap URL via the Search Console URL Inspection API -> data/seo/index-status.json
// Needs GSC_SA_JSON + GSC_SITE (service account added to the property). Skips quietly without them. UNTESTED against the live API.
import fs from 'fs';
import crypto from 'crypto';
const sa = process.env.GSC_SA_JSON, site = process.env.GSC_SITE;
if (!sa || !site) { console.log('inspect: no credentials, skipped'); process.exit(0); }
const k = JSON.parse(sa);
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const u = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: k.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
const jwt = u + '.' + crypto.sign('RSA-SHA256', Buffer.from(u), k.private_key).toString('base64url');
const tok = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}` })).json();
if (!tok.access_token) { console.error('auth failed'); process.exit(1); }
const sm = fs.readFileSync('sitemap.xml', 'utf8');
const urls = [...sm.matchAll(/<loc>([^<]*)/g)].map(m => m[1]);
const path = 'data/seo/index-status.json';
const prev = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : {};
// oldest-checked first, max 150/run (API quota is 2000/day/property)
urls.sort((a, b) => (prev[a]?.checked || '').localeCompare(prev[b]?.checked || ''));
for (const url of urls.slice(0, 150)) {
  const r = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', { method: 'POST', headers: { authorization: 'Bearer ' + tok.access_token, 'content-type': 'application/json' }, body: JSON.stringify({ inspectionUrl: url, siteUrl: site }) });
  const j = await r.json();
  const s = j.inspectionResult?.indexStatusResult;
  prev[url] = { verdict: s?.verdict || 'ERR', coverage: s?.coverageState || j.error?.message || '', lastCrawl: s?.lastCrawlTime || null, checked: new Date().toISOString().slice(0, 10) };
  await new Promise(r => setTimeout(r, 300));
}
fs.writeFileSync(path, JSON.stringify(prev, null, 1));
const idx = Object.values(prev).filter(v => v.verdict === 'PASS').length;
console.log(`inspect: ${idx}/${Object.keys(prev).length} indexed`);
