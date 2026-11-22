// Fixes horizontal page overflow on phones (grid min-content blowout, wide tables). Mobile-only (<=900px), idempotent.
// Usage: node scripts/visual/mobile_fix.mjs <file...>   (default: the known offenders)
import fs from 'fs';
const CSS = '/*MFIX*/@media(max-width:900px){.main,main,.layout,.wrap-grid{grid-template-columns:minmax(0,1fr)}section,.card,.panel,.card-body,.card-header,.field-grid>*{min-width:0}input,select,textarea{min-width:0;max-width:100%;box-sizing:border-box}.card-body,.panel{overflow-x:auto}.card-header,.panel-head{flex-wrap:wrap;gap:8px}.toggle-btn-group,.unit-toggle-group,.incoterm-group,.type-tabs{flex-wrap:wrap;max-width:100%}.item-table-wrap,.table-wrap{overflow-x:auto;max-width:100%}}/*/MFIX*/';
const files = process.argv.length > 2 ? process.argv.slice(2) : ['cbm.html','container-loading-calculator-en.html','fob-cif.html','invoice-packing-generator.html','landed-cost-calculator.html','rfx-generator.html','en/cbm-calculator.html','en/container-loading-calculator.html','en/invoice-packing-generator.html','en/landed-cost-calculator.html','en/rfq-rfp-rfi-generator.html','en/should-cost-calculator.html'];
let n = 0;
for (const f of files) {
  let s = fs.readFileSync(f, 'utf8'); const o = s;
  s = s.replace(/\/\*MFIX\*\/[\s\S]*?\/\*\/MFIX\*\//, '');
  s = s.replace('</style>', CSS + '\n</style>');
  if (s !== o) { fs.writeFileSync(f, s); n++; }
}
console.log('mobile fix applied to', n);
