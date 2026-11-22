const UA = { 'user-agent': 'Mozilla/5.0 (compatible; CBMLabBot/1.0; +https://procurement-toolkit-eight.vercel.app)' };
async function t(name, u, o = {}) { try { const r = await fetch(u, { ...o, headers: { ...UA, ...(o.headers || {}) } }); const x = await r.text(); console.log('PROBE', name, r.status, r.headers.get('content-type'), x.length, x.slice(0, 600).replace(/\s+/g, ' ')); } catch (e) { console.log('PROBE', name, 'ERR', e.message); } }
const wb = await (await fetch('https://search.worldbank.org/api/v2/procnotices?format=json&rows=60&os=0&srt=noticedate&order=desc&apilang=en')).json();
const a = Object.values(wb.procnotices); console.log('PROBE wb types', JSON.stringify([...new Set(a.map(x => x.notice_type))]), 'keys', Object.keys(a.find(x => !/award/i.test(x.notice_type)) || a[0]).join(','));
console.log('PROBE wb nonaward', JSON.stringify(a.find(x => !/award/i.test(x.notice_type))).slice(0, 900));
await t('ungm-get', 'https://www.ungm.org/Public/Notice');
await t('ungm-post-form', 'https://www.ungm.org/Public/Notice/Search', { method: 'POST', headers: { 'content-type': 'application/json; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest', referer: 'https://www.ungm.org/Public/Notice' }, body: JSON.stringify({ PageIndex: 0, PageSize: 15, Title: '', Description: '', Reference: '', PublishedFrom: '', PublishedTo: '', DeadlineFrom: '', DeadlineTo: '', Countries: [], Agencies: [], UNSPSCs: [], NoticeTypes: [], SortField: 'DatePublished', SortAscending: false, isPicker: false, IsSustainable: false, IsActive: true, NoticeDisplayType: null, NoticeSearchTotalLabelId: 'noticeSearchTotal', TypeOfCompetitions: [] }) });
await t('canada-ua', 'https://canadabuys.canada.ca/opendata/pub/openTenderNotice-ouvertAvisAppelOffres.csv');
await t('canada-api', 'https://canadabuys.canada.ca/en/tender-opportunities');
await t('undp', 'https://procurement-notices.undp.org/');
await t('who', 'https://www.who.int/about/accountability/procurement');
await t('adb', 'https://www.adb.org/projects/tenders');
await t('afdb', 'https://www.afdb.org/en/projects-and-operations/procurement');
await t('reliefweb', 'https://api.reliefweb.int/v1/reports?appname=cbmlab&limit=1');
await t('pz-tendering', 'https://public-api.prozorro.gov.ua/api/2.5/tenders?descending=1&limit=5&opt_fields=status,title');
await t('ted-total', 'https://api.ted.europa.eu/v3/notices/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'notice-type=cn-standard', fields: ['publication-number'], limit: 1, page: 1, scope: 'ACTIVE' }) });
await t('sam', 'https://api.sam.gov/opportunities/v2/search?limit=1');
await t('ungm-rss', 'https://www.ungm.org/Public/Notice/Rss');
