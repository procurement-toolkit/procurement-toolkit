import fs from 'fs';
import { FAMS, FAM_OF } from './palette.mjs';
import { G1 } from './guides1.mjs';
import { G2 } from './guides2.mjs';
import { G3 } from './guides3.mjs';
const GD = Object.fromEntries([...G1, ...G2, ...G3].map(g => [g.k, g]));
const REF = [
  ['CPV — Regulation (EC) No 2195/2002 (EUR-Lex)', 'https://eur-lex.europa.eu/eli/reg/2002/2195/oj'],
  ['TED — Tenders Electronic Daily', 'https://ted.europa.eu'],
  ['UNSPSC', 'https://www.unspsc.org'],
  ['UN Global Marketplace (UNGM)', 'https://www.ungm.org'],
  ['World Bank — Procurement', 'https://www.worldbank.org/en/projects-operations/procurement'],
  ['ICC — Incoterms rules', 'https://iccwbo.org/business-solutions/incoterms-rules/'],
];
const TXT = {
  ko: {
    guide: '입찰 가이드', title: l => `${l} 입찰 가이드 — 공고 찾는 법·평가 기준·준비 서류`, h1: l => `${l} 입찰 가이드`,
    s_sum: '한눈에 보기', s_what: '이 분야에서 나오는 공고', s_buyers: '주요 발주처', s_codes: '분류 코드로 찾기', s_eval: '평가에서 보는 것', s_pit: '자주 하는 실수',
    s_docs: '준비 서류 체크리스트', s_flow: '입찰은 이렇게 진행됩니다', s_live: '지금 열려 있는 공고', s_faq: '자주 묻는 질문', s_kw: '자주 찾는 검색어', s_rel: '함께 보면 좋은 분야', s_ref: '공식 참고 자료',
    codesP: '공고 제목만으로는 분야가 애매할 때, 분류 코드로 찾으면 빠릅니다. 유럽 공고는 EU 공통조달용어집(CPV) 코드를, 국제기구 공고는 UNSPSC 코드를 주로 사용합니다. 이 분야와 가까운 분류는 다음과 같습니다.',
    cpvL: 'CPV(EU) 대분류', unL: 'UNSPSC 대분류', div: '코드',
    flow: [['공고 확인', '새 공고를 매일 확인하고, 마감일·참가 자격·제출 방법을 먼저 읽습니다.'], ['자격·등록', '발주처 전자조달 시스템이나 UNGM 같은 플랫폼에 업체 등록이 필요한 경우가 많습니다. 등록에 시간이 걸리니 미리 해 두는 편이 좋습니다.'], ['질의', '이해가 안 되는 조항은 마감 전 질의 기간에 서면으로 묻습니다. 답변은 모든 참가자에게 공유됩니다.'], ['제출', '기술 제안서와 가격 제안서를 요구 양식에 맞춰 마감 시각 전에 제출합니다. 마감 시각은 현지 시간일 수 있습니다.'], ['평가', '자격 → 기술 → 가격 순으로 평가하는 경우가 많고, 가격만으로 정하지 않는 공고도 있습니다.'], ['낙찰·계약', '낙찰 통보 후 계약 조건을 협의하고 계약을 체결합니다. 보증서 제출이 필요한 경우가 있습니다.']],
    live: (n, c) => `현재 이 사이트에 모인 ${n}건의 ${c} 공고가 열려 있습니다. 최근 올라온 공고는 다음과 같습니다.`, liveNone: '지금 이 분야에 모인 공고가 없습니다. 새 공고는 매일 추가됩니다.', topC: '공고가 많은 나라', topS: '주요 출처', all: l => `${l} 공고 전체 보기`, deadline: '마감', pub: '공고일',
    note: '이 글은 일반적인 안내이며 법률·계약 자문이 아닙니다. 참가 자격과 제출 조건은 공고마다 다르므로 반드시 공고 원문을 기준으로 확인하세요.',
    hubTitle: '분야별 입찰 가이드 — 공공입찰 공고 유형별 정리', hubH1: '분야별 입찰 가이드', hubSub: '건축, 의료, IT, 컨설팅, 물류 등 분야별로 어떤 공고가 나오고 무엇을 준비해야 하는지 정리했습니다.', hubDesc: n => `공공입찰 ${n}개 분야별 가이드. 공고 유형, 주요 발주처, 분류 코드, 평가 기준, 준비 서류, 자주 묻는 질문을 분야별로 정리했습니다.`, home: '입찰공고 검색', sectors: '분야',
  },
  en: {
    guide: 'tender guide', title: l => `${l} Tender Guide — How to Find Notices, Evaluation and Documents`, h1: l => `${l}: tender guide`,
    s_sum: 'At a glance', s_what: 'What notices appear in this sector', s_buyers: 'Who buys', s_codes: 'Finding notices by classification code', s_eval: 'What evaluators look at', s_pit: 'Common mistakes',
    s_docs: 'Document checklist', s_flow: 'How a tender usually runs', s_live: 'Open notices right now', s_faq: 'Frequently asked questions', s_kw: 'Common searches', s_rel: 'Related sectors', s_ref: 'Official references',
    codesP: 'When a title does not make the sector obvious, classification codes help. European notices use the Common Procurement Vocabulary (CPV), while international organizations mostly use UNSPSC. The closest categories for this sector are:',
    cpvL: 'CPV (EU) divisions', unL: 'UNSPSC segments', div: 'Code',
    flow: [['Find the notice', 'Check new notices daily and read the deadline, eligibility and submission method first.'], ['Eligibility and registration', 'Many buyers require registration on their e-procurement system or a platform such as UNGM. It takes time, so register early.'], ['Clarifications', 'Ask about unclear clauses in writing during the clarification period. Answers are shared with all bidders.'], ['Submission', 'Submit the technical and price proposals in the required format before the deadline, which may be in local time.'], ['Evaluation', 'Evaluation often goes eligibility, then technical, then price, and some notices do not award on price alone.'], ['Award and contract', 'After award notification the contract terms are agreed and signed. A guarantee may be required.']],
    live: (n, c) => `There are currently ${n} open ${c} notices collected on this site. The most recent are:`, liveNone: 'No notices in this sector are collected right now. New notices are added every day.', topC: 'Countries with most notices', topS: 'Main sources', all: l => `All ${l} notices`, deadline: 'Deadline', pub: 'Published',
    note: 'This is general guidance, not legal or contract advice. Eligibility and submission terms differ by notice, so always rely on the original notice.',
    hubTitle: 'Tender Guides by Sector — Public Procurement Notice Types Explained', hubH1: 'Tender guides by sector', hubSub: 'What notices appear in each sector such as construction, health, IT, consulting and logistics, and what to prepare.', hubDesc: n => `${n} sector guides to public tenders: notice types, main buyers, classification codes, evaluation criteria, documents and FAQs.`, home: 'Tender search', sectors: 'Sector',
  },
};
export function renderGuides(c) {
  const { T, SECT, SECT_OTHER, SECT_BY, SECT_LABEL, SEC_ICON, data, BASE, today, CSS, svg, esc, SRC, sectAll } = c;
  const keys = SECT.map(s => s.k).filter(k => GD[k]);
  const out = [];
  const css = CSS + `.guide h2{border-left:4px solid var(--gc,var(--rust));padding-left:10px}.hero{border-bottom:4px solid var(--gc,transparent)}.ghub a{border-left:4px solid var(--c)}.ghub svg{background:color-mix(in srgb,var(--c) 13%,#fff);fill:var(--c)}.ghub a:hover{border-color:var(--c)}.guide{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:6px 20px 20px;margin-bottom:14px}.guide h2{font-size:1.15rem;margin:26px 0 8px}.guide h3{font-size:1rem;margin:16px 0 4px}.guide p,.guide li{line-height:1.8;font-size:15px}.guide ul,.guide ol{padding-left:20px;margin:6px 0}.guide table{width:100%;border-collapse:collapse;font-size:14px;margin:8px 0}.guide td,.guide th{border-bottom:1px solid var(--line);padding:7px 6px;text-align:left;vertical-align:top}.guide th{color:var(--mute);font-weight:600;white-space:nowrap}.guide a{color:var(--rust)}.guide .kw span{display:inline-block;margin:3px 6px 0 0;padding:2px 9px;border:1px solid var(--line);border-radius:999px;font-size:13px}.gl{list-style:none;padding:0!important}.gl li{padding:9px 0;border-bottom:1px solid var(--line)}.gl small{display:block;color:var(--mute)}.gcta{display:inline-block;margin:6px 0;padding:10px 16px;border:1px solid var(--ink);border-radius:10px;text-decoration:none;font-weight:600;color:var(--ink)!important}.ghub{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}.ghub a{display:flex;gap:10px;padding:12px 14px;background:var(--card);border:1px solid var(--line);border-radius:12px;text-decoration:none;color:var(--ink)}.ghub svg{width:22px;height:22px;fill:var(--rust);flex:none;margin-top:2px}.ghub b{display:block;font-size:14.5px}.ghub small{color:var(--mute);font-size:12.5px;line-height:1.5}`;
  const shell = (t, slug, title, desc, h1, sub, body, ld) => {
    const L = t.lang, url = `${BASE}/${t.dir}/guide/${slug}.html`, altUrl = `${BASE}/${L === 'ko' ? 'en/bids' : 'bids'}/guide/${slug}.html`;
    return `<!DOCTYPE html>
<html lang="${L}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | CBM Lab</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${url}">
<link rel="alternate" hreflang="${L}" href="${url}"><link rel="alternate" hreflang="${L === 'ko' ? 'en' : 'ko'}" href="${altUrl}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><meta property="og:type" content="article">
<script type="application/ld+json">${JSON.stringify(ld)}</script><style>${css}</style></head><body>
<header class="top"><a href="../${t.hubHref}">CBM LAB · ${t.hub}</a><a href="../${L === 'ko' ? '../en/bids/' : '../../bids/'}guide/${slug}.html" hreflang="${L === 'ko' ? 'en' : 'ko'}">${t.other.label}</a></header>
<div class="hero" style="--gc:${FAM_OF[slug] ? FAM_OF[slug].c : 'transparent'}"><div class="in"><a class="crumb" href="${slug === 'index' ? '../index.html' : 'index.html'}">← ${slug === 'index' ? t.home : TXT[L].hubH1}</a><h1>${esc(h1)}</h1><p>${esc(sub)}</p></div></div>
<div class="wrap" style="--gc:${FAM_OF[slug] ? FAM_OF[slug].c : '#a63d22'}">${body}</div></body></html>`;
  };
  for (const t of Object.values(T)) {
    const L = t.lang, X = TXT[L];
    fs.mkdirSync(`${t.dir}/guide`, { recursive: true });
    for (const k of keys) {
      const g = GD[k], S = SECT_BY[k][L], G = g[L], label = SECT_LABEL[k][L];
      const list = data.filter(x => x.sector === k);
      const ul = a => `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
      const row = (r, lab) => `<tr><th>${esc(r[0])}</th><td>${esc(r[L === 'ko' ? 1 : 2])}</td></tr>`;
      const cnt = (f) => { const m = {}; for (const x of list) { const v = f(x); if (v) m[v] = (m[v] || 0) + 1 } return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5) };
      const live = list.length
        ? `<p>${X.live(list.length.toLocaleString(t.loc), label)}</p><ul class="gl">${list.slice(0, 5).map(x => `<li><a href="../n/${x.h}">${esc(x.title)}</a><small>${esc(x.org || '')}${x.country ? ' · ' + esc(x.country) : ''}${x.deadline ? ' · ' + X.deadline + ' ' + esc(x.deadline) : ''}</small></li>`).join('')}</ul><p>${X.topC}: ${cnt(x => x.country).map(([a, b]) => `${esc(a)} (${b})`).join(', ')}</p><p>${X.topS}: ${cnt(x => SRC[x.source]?.[L]).map(([a, b]) => `${esc(a)} (${b})`).join(', ')}</p><a class="gcta" href="../c-${k}.html">${X.all(label)} →</a>`
        : `<p>${X.liveNone}</p>`;
      const idx = keys.indexOf(k), rel = [1, 2, 3, 4].map(d => keys[(idx + d) % keys.length]);
      const body = `<article class="guide">
<h2>${X.s_sum}</h2>${S.intro.slice(1).map(p => `<p>${esc(p)}</p>`).join('')}
<h2>${X.s_what}</h2>${ul(G.what.filter(w => !S.intro.includes(w)))}
<h2>${X.s_buyers}</h2><p>${esc(G.buyers)}</p>
<h2>${X.s_codes}</h2><p>${X.codesP}</p><table><tr><th colspan="2">${X.cpvL}</th></tr>${g.cpv.map(r => row(r)).join('')}<tr><th colspan="2">${X.unL}</th></tr>${g.un.map(r => row(r)).join('')}</table>
<h2>${X.s_eval}</h2>${ul(G.eval)}
<h2>${X.s_pit}</h2>${ul(G.pit)}
<h2>${X.s_docs}</h2>${ul(G.docs)}
<h2>${X.s_flow}</h2><ol>${X.flow.map(f => `<li><b>${esc(f[0])}</b> — ${esc(f[1])}</li>`).join('')}</ol>
<h2>${X.s_live}</h2>${live}
<h2>${X.s_faq}</h2>${G.faq.map(f => `<h3>${esc(f[0])}</h3><p>${esc(f[1])}</p>`).join('')}
<h2>${X.s_kw}</h2><p class="kw">${S.terms.map(w => `<span>${esc(w)}</span>`).join('')}</p>
<h2>${X.s_rel}</h2><ul>${rel.map(r => `<li><a href="${r}.html">${esc(SECT_LABEL[r][L])}</a></li>`).join('')}</ul>
<h2>${X.s_ref}</h2><ul>${REF.map(r => `<li><a href="${r[1]}" rel="noopener" target="_blank">${esc(r[0])}</a></li>`).join('')}</ul>
<p class="note">${X.note}</p></article>`;
      const title = X.title(label), desc = `${label} ${L === 'ko' ? '입찰' : 'tender'}: ${S.intro[0]}`.slice(0, 300), url = `${BASE}/${t.dir}/guide/${k}.html`;
      const ld = [
        { '@context': 'https://schema.org', '@type': 'Article', headline: title, description: desc, inLanguage: L, dateModified: today, mainEntityOfPage: url, author: { '@type': 'Organization', name: 'CBM Lab' }, publisher: { '@type': 'Organization', name: 'CBM Lab' }, keywords: S.terms.join(', ') },
        { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: G.faq.map(f => ({ '@type': 'Question', name: f[0], acceptedAnswer: { '@type': 'Answer', text: f[1] } })) },
        { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: t.home, item: `${BASE}/${t.dir}/` }, { '@type': 'ListItem', position: 2, name: X.hubH1, item: `${BASE}/${t.dir}/guide/index.html` }, { '@type': 'ListItem', position: 3, name: label, item: url }] },
      ];
      fs.writeFileSync(`${t.dir}/guide/${k}.html`, shell(t, k, title, desc, X.h1(label), S.intro[0], body, ld));
      out.push(`${t.dir}/guide/${k}.html`);
    }
    const hubBody = FAMS.map(f => { const ks = keys.filter(k => f.s.includes(k)); return ks.length ? `<h3 class="fam" style="--c:${f.c}">${esc(f[L])}</h3><div class="ghub">${ks.map(k => `<a href="${k}.html" style="--c:${f.c}">${svg(SEC_ICON[k])}<span><b>${esc(SECT_LABEL[k][L])}</b><small>${esc(SECT_BY[k][L].intro[0].slice(0, 70))}…</small></span></a>`).join('')}</div>` : '' }).join('');
    const hubLd = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: X.hubTitle, inLanguage: L, url: `${BASE}/${t.dir}/guide/index.html`, mainEntity: { '@type': 'ItemList', itemListElement: keys.map((k, i) => ({ '@type': 'ListItem', position: i + 1, url: `${BASE}/${t.dir}/guide/${k}.html`, name: SECT_LABEL[k][L] })) } };
    fs.writeFileSync(`${t.dir}/guide/index.html`, shell(t, 'index', X.hubTitle, X.hubDesc(keys.length), X.hubH1, X.hubSub, hubBody, hubLd));
    out.push(`${t.dir}/guide/index.html`);
  }
  return { keys, out };
}
