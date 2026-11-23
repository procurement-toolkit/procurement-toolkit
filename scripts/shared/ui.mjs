// Shared UI layer for the fairs and bids pages (appended after each page's own CSS).
// Principles: every clickable thing must look clickable (raised surface, border, arrow or chevron, hover lift, pressed state);
// categories use one pastel family each (tint = the category hue mixed into white, text/border = deeper tone of the same hue);
// no extra decoration beyond that. Colours come from the per-element --c variable, so both sections stay in step.
export const UI_CSS = `
:root{--sh1:0 1px 2px rgba(22,35,46,.07),0 4px 12px -8px rgba(22,35,46,.28);--sh2:0 2px 4px rgba(22,35,46,.08),0 10px 22px -10px rgba(22,35,46,.32);--ring:0 0 0 3px rgba(166,61,34,.22)}
a:focus-visible,button:focus-visible,select:focus-visible,input:focus-visible,summary:focus-visible{outline:none;box-shadow:var(--ring)}
.hero{background:linear-gradient(160deg,#16232e 0%,#213746 100%)}
.stat{background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.08)}
/* category tiles — pastel tint, deeper border, chevron */
.tile{--c:#6b7780;position:relative;padding-right:30px;background:color-mix(in srgb,var(--c) 12%,#fff);border:1px solid color-mix(in srgb,var(--c) 30%,#fff);border-radius:14px;box-shadow:var(--sh1);transition:transform .15s,box-shadow .15s,border-color .15s,background .15s}
.tile svg{fill:var(--c)}
.tile::after{content:"›";position:absolute;right:11px;top:50%;width:auto;height:auto;border:0;transform:translateY(-52%);font-size:22px;line-height:1;color:var(--c);opacity:.75;transition:transform .15s}
.tile small{color:color-mix(in srgb,var(--c) 55%,#5a6872)}
.tile:hover{transform:translateY(-2px);box-shadow:var(--sh2);border-color:var(--c);background:color-mix(in srgb,var(--c) 18%,#fff)}
.tile:hover::after{transform:translate(3px,-52%);border:0;opacity:1}
.tile:active{transform:translateY(0);box-shadow:var(--sh1)}
.tile.on{background:var(--c);border-color:var(--c);color:#fff}
.tile.on svg{fill:#fff}.tile.on::after{color:#fff;opacity:.9;border:0}.tile.on small{color:rgba(255,255,255,.85)}
/* chips — pastel pill, count badge, fills on hover */
.chip{--c:#5b7a99;background:color-mix(in srgb,var(--c) 13%,#fff);border:1px solid color-mix(in srgb,var(--c) 32%,#fff);color:color-mix(in srgb,var(--c) 70%,#16232e);box-shadow:var(--sh1);font-weight:600;transition:transform .15s,box-shadow .15s,background .15s,color .15s}
.chip b{display:inline-block;min-width:20px;padding:0 6px;border-radius:99px;background:rgba(255,255,255,.75);font-size:11.5px;text-align:center;font-weight:700}
.chip:hover,.chip.on{background:var(--c);border-color:var(--c);color:#fff;transform:translateY(-1px);box-shadow:var(--sh2)}
.chip:hover b,.chip.on b{background:rgba(255,255,255,.22);color:#fff}
.chip.all{--c:#16232e;background:#fff}.chip.all:hover{color:#fff}
/* raised buttons */
.qk button,.pager button,#frs,.btn,.gl2{background:linear-gradient(#fff,#f5f1e4);border:1px solid #cfc6af;color:var(--ink);box-shadow:0 2px 0 #d3cbb6,0 6px 12px -8px rgba(22,35,46,.35);transition:transform .12s,box-shadow .12s,background .12s,color .12s,border-color .12s}
.qk button:hover:not(.on),.pager button:hover:not(:disabled):not(.cur),#frs:hover,.btn:hover,.gl2:hover{transform:translateY(-1px);border-color:var(--rust);color:var(--rust);box-shadow:0 3px 0 #d3cbb6,0 10px 16px -8px rgba(22,35,46,.35)}
.qk button:active,.pager button:active:not(:disabled),#frs:active,.btn:active,.gl2:active{transform:translateY(1px);box-shadow:0 0 0 #d3cbb6}
.qk button.on,.pager button.cur{background:linear-gradient(#26414f,#16232e);border-color:#16232e;color:#fff;box-shadow:0 2px 0 #0c141b}
.qk .rs,#frs{background:transparent;box-shadow:none;border-style:dashed;color:var(--mute)}
.gl2{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:999px}
.gl2::after{content:"→";transition:transform .15s}.gl2:hover::after{transform:translateX(3px)}
a.btn{display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;border-radius:12px}
a.btn::after{content:"→"}
/* list cards */
.item{position:relative;padding-right:40px;box-shadow:var(--sh1);transition:transform .15s,box-shadow .15s,border-color .15s,background .15s}
.item::after{content:"›";position:absolute;right:14px;top:50%;transform:translateY(-50%);font-size:24px;line-height:1;color:var(--c,#6b7780);opacity:.55;transition:transform .15s,opacity .15s}
.item:hover{transform:translateY(-1px);box-shadow:var(--sh2);border-color:color-mix(in srgb,var(--c,#6b7780) 55%,#d3cbb6);background:color-mix(in srgb,var(--c,#6b7780) 6%,#fbf9f2)}
.item:hover::after{opacity:1;transform:translate(3px,-50%)}
.item a.t,.item .t{text-decoration:none}
.item .t::before{content:"";position:absolute;inset:0;z-index:1;border-radius:12px}
.item .th{position:relative;z-index:0}
.tag{background:color-mix(in srgb,var(--c,#6b7780) 14%,#fff);border-color:color-mix(in srgb,var(--c,#6b7780) 30%,#fff)}
.tag.hot{background:#fde7df;border-color:#f3c3b3;color:#a63d22;font-weight:600}
/* inputs */
.fb input,.fb select,.bar input,.bar select{border-radius:10px}
.adv summary{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px dashed #cfc6af;border-radius:999px;background:#fff;color:var(--mute);cursor:pointer;list-style:none}
.adv summary::-webkit-details-marker{display:none}.adv summary::after{content:"▾"}.adv[open] summary::after{content:"▴"}
.crumb{display:inline-flex;align-items:center;padding:3px 10px;border:1px solid rgba(255,255,255,.22);border-radius:99px;transition:background .15s}
.crumb:hover{background:rgba(255,255,255,.12)}
`;
