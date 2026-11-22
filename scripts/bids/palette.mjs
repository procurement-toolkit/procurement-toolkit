// Muted, harmonious colour families for sectors (tint = same hue at low opacity for backgrounds).
export const FAMS = [
  { k: 'infra', c: '#8a5a3c', ko: '건설·인프라', en: 'Construction & infrastructure', s: ['buildings', 'roads-bridges', 'water-sanitation', 'engineering-design', 'machinery'] },
  { k: 'energy', c: '#3f7d5a', ko: '에너지·환경', en: 'Energy & environment', s: ['fuel-gas', 'power-grid', 'renewable-energy', 'environment-waste'] },
  { k: 'health', c: '#b0434f', ko: '보건·인도지원', en: 'Health & humanitarian', s: ['pharma-vaccines', 'medical-equipment', 'health-services', 'humanitarian'] },
  { k: 'digital', c: '#3a63a8', ko: 'IT·디지털', en: 'IT & digital', s: ['software-development', 'it-hardware'] },
  { k: 'pro', c: '#6b5aa6', ko: '전문 용역·자문', en: 'Professional services', s: ['individual-contractor', 'professional-services', 'consulting-advisory', 'research-evaluation', 'training-capacity', 'audit-finance', 'grants-ngo'] },
  { k: 'goods', c: '#a8741f', ko: '물품·장비', en: 'Goods & equipment', s: ['vehicles', 'furniture-office', 'textiles-uniforms', 'lab-scientific', 'education-materials', 'general-supplies'] },
  { k: 'food', c: '#6b8a2f', ko: '식품·농업·주방', en: 'Food, farming & kitchen', s: ['food-catering', 'kitchen-equipment', 'agriculture'] },
  { k: 'services', c: '#237f86', ko: '운영·지원 서비스', en: 'Operations & support services', s: ['logistics', 'security-safety', 'facility-services', 'events-travel', 'printing-media'] },
  { k: 'other', c: '#6b7780', ko: '기타', en: 'Other', s: ['other'] },
];
export const FAM_OF = Object.fromEntries(FAMS.flatMap(f => f.s.map(k => [k, f])));
