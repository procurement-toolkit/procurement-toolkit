// Finds a fair-specific photo on Wikimedia Commons for fairs that only have a venue photo (or none).
// Runs in GitHub Actions (needs internet). Strict filter; anything unclear is skipped so the venue photo stays.
// Results go to data/fairs/images.auto.txt (same format as images.txt). Reject a pick by adding its key to data/fairs/images.deny.txt.
import fs from 'fs';
const rd = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')) : [];
const norm = s => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const LIC = /^(CC BY|CC BY-SA|CC0|Public domain)/i;
const CTX = /\b(messe|fair|expo|messegelande|halle|hall|stand|booth|trade|ausstellung|exhibition)\b|\b(19|20)\d\d\b/;
const BAD = /logo|poster|plakat|medal|portrait|award|verleihung|speaker|interview|cosplay|crowd|selfie|map|chart|diagram|screenshot/i;
export function accept(fairName, item) {
  const nn = norm(fairName.split('/')[0]);
  if (nn.length < 6 && !nn.includes(' ')) return false;                // short single words match unrelated files
  const t = norm(item.t);
  if (!t.includes(nn) || BAD.test(item.t) || !LIC.test(item.lic || '')) return false;
  if (!/jpe?g/i.test(item.mime || 'jpeg')) return false;
  return CTX.test(t.replace(nn, ' '));
}
if (process.argv[1]?.endsWith('images.mjs')) {
  const have = new Set([...rd('data/fairs/images.txt'), ...rd('data/fairs/images.auto.txt')].map(l => l.split('|')[0].toLowerCase()));
  const deny = new Set(rd('data/fairs/images.deny.txt').map(x => x.toLowerCase()));
  const names = [...new Set(rd('data/fairs/fairs.txt').map(l => l.split('|')[0]))];
  const todo = names.filter(n => ![...have].some(k => !k.startsWith('venue:') && n.toLowerCase().includes(k)) && !deny.has(n.toLowerCase())).slice(0, 25);
  const out = [];
  for (const n of todo) {
    try {
      const u = 'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=extmetadata|mime&format=json&gsrsearch=' + encodeURIComponent(n);
      const j = await (await fetch(u, { headers: { 'User-Agent': 'cbm-lab-fairs/1.0 (https://procurement-toolkit-eight.vercel.app)' } })).json();
      const items = Object.values(j.query?.pages || {}).map(p => { const i = p.imageinfo?.[0], m = i?.extmetadata || {}; return { t: p.title.replace('File:', ''), lic: m.LicenseShortName?.value, mime: i?.mime, a: (m.Artist?.value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 40) }; });
      const hit = items.find(x => accept(n, x));
      out.push(hit ? `${n}|${hit.t}|${hit.lic}|${hit.a || 'Wikimedia Commons contributor'}` : `# none: ${n}`);   // 'none' lines are retried next run only if removed
    } catch (e) { console.log('skip', n, e.message); }
    await new Promise(r => setTimeout(r, 1000));
  }
  if (out.length) fs.appendFileSync('data/fairs/images.auto.txt', out.join('\n') + '\n');
  console.log('image lookup:', out.filter(l => !l.startsWith('#')).length, 'found of', todo.length);
}
