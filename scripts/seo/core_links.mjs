// Idempotently adds a small "core tools" link strip to every HTML page so crawlers reach the key tool pages from everywhere.
import fs from 'node:fs';
import path from 'node:path';
const KO = [['랜디드코스트 계산기', 'landed-cost-calculator.html'], ['컨테이너 적재 시뮬레이터', 'container-loading-visualizer.html'], ['CBM 계산기', 'cbm.html'], ['인코텀즈 가이드', 'incoterms-guide.html'], ['HS코드 가이드', 'hs-code-guide.html'], ['FTA 가이드', 'fta-guide.html'], ['개인통관 관세 계산기', 'personal-duty-calculator.html'], ['FOB·CIF 비교', 'fob-cif.html']];
const EN = [['Landed cost calculator', 'landed-cost-calculator.html'], ['Container loading calculator', 'container-loading-calculator.html'], ['Incoterms guide', 'incoterms-guide.html'], ['HS code guide', 'hs-code-guide.html'], ['FTA guide', 'fta-guide.html'], ['TCO calculator', 'tco-calculator.html'], ['Kraljic matrix', 'kraljic-matrix.html'], ['Should-cost calculator', 'should-cost-calculator.html']];
const MARK = '<!--core-links-->', END = '<!--/core-links-->';
const CSS = '<style>.corelinks{max-width:1180px;margin:28px auto 0;padding:16px 20px;border-top:1px solid #e3e6ec;font:13px/1.9 system-ui,sans-serif;color:#5b6577}.corelinks b{color:#2a3345;margin-right:6px}.corelinks a{display:inline-block;margin:0 6px 4px 0;padding:2px 10px;border:1px solid #d6dbe5;border-radius:999px;background:#f6f8fb;color:#2a3345;text-decoration:none}.corelinks a:hover{background:#e9eef6;border-color:#b9c3d6}</style>';
const SKIP = new Set(['node_modules', '.git', '.github', 'reports']);
let n = 0, seen = 0;
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!e.name.endsWith('.html') || /^google[0-9a-f]+\.html$/.test(e.name)) continue;
    let h = fs.readFileSync(p, 'utf8'); seen++;
    if (!h.includes('</body>')) continue;
    const en = p.split(path.sep).includes('en'), list = en ? EN : KO, base = (en ? '/en/' : '/');
    const here = '/' + p.split(path.sep).join('/');
    const block = `${MARK}${CSS}<nav class="corelinks" aria-label="${en ? 'Popular tools' : '주요 도구'}"><b>${en ? 'Popular tools' : '주요 도구'}</b>${list.filter(([, f]) => here !== base + f).map(([t, f]) => `<a href="${base}${f}">${t}</a>`).join('')}</nav>${END}`;
    const re = new RegExp(MARK + '[\\s\\S]*?' + END);
    const out = h.includes(MARK) ? h.replace(re, () => block) : h.replace('</body>', () => block + '</body>');
    if (out !== h) { fs.writeFileSync(p, out); n++; }
  }
})('.');
console.log(`core links: ${n} pages updated, ${seen} scanned`);
