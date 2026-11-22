// Optional: pulls Search Console clicks/impressions per page (last 28d) into data/seo/gsc.json.
// Needs secrets GSC_SA_JSON (service account JSON, added as a user on the property) and GSC_SITE (e.g. sc-domain:example.com or the URL prefix).
// UNTESTED against the live API - needs credentials first. Skips quietly if absent.
import fs from 'fs';
import crypto from 'crypto';
const sa = process.env.GSC_SA_JSON, site = process.env.GSC_SITE;
if (!sa || !site) { console.log('gsc: no credentials, skipped'); process.exit(0); }
const k = JSON.parse(sa);
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: k.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
const jwt = unsigned + '.' + crypto.sign('RSA-SHA256', Buffer.from(unsigned), k.private_key).toString('base64url');
const tok = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}` })).json();
if (!tok.access_token) { console.error('gsc auth failed', tok); process.exit(1); }
const d = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const r = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, { method: 'POST', headers: { authorization: 'Bearer ' + tok.access_token, 'content-type': 'application/json' }, body: JSON.stringify({ startDate: d(30), endDate: d(2), dimensions: ['page', 'query'], rowLimit: 5000 }) });
const j = await r.json();
fs.writeFileSync('data/seo/gsc.json', JSON.stringify({ fetched: d(0), rows: j.rows || [] }, null, 1));
console.log('gsc rows', (j.rows || []).length);
