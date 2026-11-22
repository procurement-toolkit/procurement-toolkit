const UA = { 'user-agent': 'Mozilla/5.0 (compatible; CBMLabBot/1.0; +https://procurement-toolkit-eight.vercel.app)' };
async function t(name, u, o = {}, n = 700) { try { const r = await fetch(u, { ...o, headers: { ...UA, ...(o.headers || {}) } }); const x = await r.text(); console.log('PROBE', name, r.status, x.length, x.slice(0, n).replace(/\s+/g, ' ')); return x; } catch (e) { console.log('PROBE', name, 'ERR', e.message); } }
await t('fts', 'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?stages=tender&limit=2');
await t('boamp', 'https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records?limit=2&order_by=dateparution%20desc', {}, 1200);
await t('secop', 'https://www.datos.gov.co/resource/p6dx-8zbt.json?$limit=2&$order=fecha_de_publicacion_del%20DESC');
await t('pz-search', 'https://prozorro.gov.ua/api/search/tenders?status=active.tendering&limit=2');
await t('pz-list-status', 'https://public-api.prozorro.gov.ua/api/2.5/tenders?descending=1&limit=3&opt_fields=status&mode=real');
await t('ted-types', 'https://api.ted.europa.eu/v3/notices/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'publication-date>=20261115 AND (notice-type=cn-social OR notice-type=cn-desg OR notice-type=cn-standard)', fields: ['publication-number'], limit: 1, page: 1, scope: 'ACTIVE' }) }, 300);
await t('ted-count', 'https://api.ted.europa.eu/v3/notices/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'publication-date>=20261101 AND notice-type=cn-standard', fields: ['publication-number'], limit: 1, page: 1, scope: 'ACTIVE' }) }, 200);
const page = await (await fetch('https://www.ungm.org/Public/Notice', { headers: UA })).text();
const i = page.indexOf('noticeSearchTotal'); console.log('PROBE ungm ctx', page.slice(Math.max(0, i - 300), i + 400).replace(/\s+/g, ' '));
const js = await (await fetch('https://www.ungm.org/Scripts/UNGM.js', { headers: UA })).text(); const k = [...js.matchAll(/Notice\/Search[^;]{0,300}/g)].slice(0, 2); console.log('PROBE ungmjs', k.map(x => x[0]).join(' || ').slice(0, 800));
const bundles = [...page.matchAll(/src="(\/bundles\/[^"]+)"/g)].map(m => m[1]);
for (const b of bundles) { const x = await (await fetch('https://www.ungm.org' + b, { headers: UA })).text(); const m = x.indexOf('Notice/Search'); if (m > -1) console.log('PROBE ungmbundle', b, x.slice(Math.max(0, m - 600), m + 700).replace(/\s+/g, ' ')); }
await t('placsp', 'https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom', {}, 400);
