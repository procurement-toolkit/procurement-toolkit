// Applies keyword-rich <title> / meta description / og tags from a map. Idempotent. Run: node scripts/seo/meta.mjs
import fs from 'fs';
const M = {
  'abc-inventory-analysis.html': ['ABC 분석·XYZ 분석 재고 관리 도구 | 파레토 80/20 품목 등급 분류 — CBM Lab', 'SKU를 소비 금액 기준으로 A·B·C 등급으로 나누고 XYZ로 수요 변동성까지 분석하는 재고 관리 도구입니다. 등급별 관리 방법과 해석 요령을 함께 정리했습니다.'],
  'aliexpress-temu-guide.html': ['알리익스프레스·테무 직구 가이드 | 관세·합산과세·KC인증 한눈에 — CBM Lab', '알리익스프레스와 테무 직구 시 알아야 할 면세한도, 합산과세, 안전인증 규정과 통관 지연을 막는 방법을 정리했습니다.'],
  'combined-taxation-guide.html': ['해외직구 합산과세 정리 | 같은 날 도착하면 면세한도 합산 기준과 피하는 법 — CBM Lab', '해외직구 합산과세의 기준(결제일이 아니라 도착일), 사례, 피하는 방법과 자주 묻는 질문을 정리했습니다.'],
  'consulting.html': ['구매·소싱·물류 컨설팅 문의 | 해외 구매 20년 경력 1:1 자문 — CBM Lab', '해외 구매와 글로벌 소싱, 물류 실무를 1:1로 자문합니다. 공급사 발굴, 원가 협상, 수입 프로세스 개선 문의를 받습니다.'],
  'container-loading-visualizer.html': ['컨테이너 적재 시뮬레이션 | 20ft·40ft 박스 적재 수량 계산기(2D·3D) — CBM Lab', '박스 규격을 입력하면 20ft·40ft·40HC 컨테이너에 몇 개가 들어가는지 2D·3D로 계산합니다. 적재율, 무게중심, 팰릿 적재까지 확인하세요.'],
  'contract-renewal-calendar.html': ['계약 갱신·해지 통지 기한 관리 캘린더 | 자동갱신 놓치지 않기 — CBM Lab', '계약 종료일과 해지 통지 기간으로 통지 기한을 계산하고, 구글 캘린더·아웃룩 알림 파일로 내보냅니다. 자동갱신 조항 관리 요령도 정리했습니다.'],
  'demurrage-detention-calculator.html': ['디머리지·디텐션 차이와 비용 계산기 | 컨테이너 무료기간(Free Time) 계산 — CBM Lab', '디머리지와 디텐션의 차이, 무료기간 이후 일수별 단계 요금 계산 방법, 비용을 줄이는 요령을 정리하고 계산기를 제공합니다.'],
  'email-generator.html': ['영문 구매 이메일 생성기 | 견적 요청·납기 문의·클레임 영어 이메일 — CBM Lab', '견적 요청, 주문 확인, 납기 지연 문의, 샘플 요청, 클레임을 영어 이메일로 작성합니다. 상황별 구성과 자주 쓰는 표현을 함께 안내합니다.'],
  'exam-calendar.html': ['무역·물류 자격시험 일정 | 관세사·무역영어·물류관리사 시험 준비 가이드 — CBM Lab', '무역 실무와 물류 분야 자격시험의 일정과 준비 방법을 한곳에 정리했습니다. 공식 접수처 링크를 함께 제공합니다.'],
  'fob-cif.html': ['FOB·CIF 수입원가 계산기 | 관세·부가세·운임 포함 착지원가 계산 — CBM Lab', 'FOB와 CIF 차이, 과세가격 환산, 관세·부가세 계산 순서를 설명하고 인코텀즈별 수입 원가와 개당 단가를 계산합니다.'],
  'forwarding-guide.html': ['배송대행지(배대지) 이용 방법 | 신청 순서·요금·통관 주의사항 — CBM Lab', '배송대행지 이용 순서와 비용 구성, 개인통관고유부호, 합배송과 면세한도 주의점을 처음 쓰는 분 기준으로 정리했습니다.'],
  'global-holiday-calendar.html': ['글로벌 물류 휴일 캘린더 | 춘절·골든위크·라마단 납기 영향과 발주 시점 — CBM Lab', '공장과 항만이 실제로 멈추는 연휴만 골라 영향 기간과 안전한 발주 시점을 알려 줍니다. 춘절, 국경절, 라마단 대응법을 정리했습니다.'],
  'iherb-guide.html': ['아이허브 직구 가이드 | 배송기간·관세·건강기능식품 통관 규정 정리 — CBM Lab', '아이허브 무료배송 기준, 배송기간, 건강기능식품 6병 규정과 면세한도, 합산과세 주의점을 최신 기준으로 정리했습니다.'],
  'inventory-planning-calculator.html': ['안전재고·EOQ·재주문점 계산기 | 재고 발주 시점과 수량 계산 공식 — CBM Lab', '경제적 주문량(EOQ), 안전재고, 재주문점 계산 공식과 예시를 설명하고 한 번에 계산합니다. 서비스 수준별 Z값도 안내합니다.'],
  'leadtime-calculator.html': ['수입 리드타임 계산기 | 발주부터 입고까지 납기일 역산과 일정 계획 — CBM Lab', '생산, 선적, 운송, 통관을 합산해 예상 도착일을 계산하고 희망 입고일에서 발주 시점을 역산합니다. 지연 요인과 대응 방법도 정리했습니다.'],
  'list-clearance-exclusion-guide.html': ['목록통관 배제 품목 총정리 | 건기식·의약품·화장품 정식 수입신고 대상 — CBM Lab', '목록통관이 안 되는 품목(건강기능식품, 의약품, 기능성 화장품, 의료기기 등)과 면세한도 이내에서도 정식신고가 필요한 경우를 정리했습니다.'],
  'oee-calculator.html': ['OEE 설비종합효율 계산기 | 가동률·성능·품질 공식과 세계 수준 85% 기준 — CBM Lab', 'OEE 계산식과 예시, 세계 수준 기준(85%), 6대 로스별 개선 방향을 정리하고 가동률·성능·양품률을 계산합니다.'],
  'personal-duty-calculator.html': ['해외직구 관부가세 계산기 | 면세한도 150달러·200달러 세금 계산 — CBM Lab', '구매 국가, 품목, 금액만 입력하면 해외직구 관세와 부가세 대상인지 바로 알려 줍니다. 면세 판단 순서와 목록통관 요건도 정리했습니다.'],
  'rfq-comparison-tool.html': ['RFQ 견적 비교 도구 | 단가·MOQ·리드타임 가중치 평가로 공급사 선정 — CBM Lab', '여러 공급사 견적을 단가, MOQ, 리드타임, 결제조건, 품질 기준으로 비교하고 가중치 점수로 선정 근거를 남기는 도구입니다.'],
  'scam-prevention-guide.html': ['해외직구·무역 사기 예방 가이드 | 대표 수법과 피해 대처·환불 방법 — CBM Lab', '가짜 쇼핑몰, 송금 계좌 변경 사기, 선입금 후 잠적 같은 대표 수법과 거래 전 점검 목록, 피해 발생 시 대응 절차를 정리했습니다.'],
  'spend-analysis-dashboard.html': ['구매 지출 분석(Spend Analysis) 대시보드 | 카테고리·공급사별 절감 기회 — CBM Lab', '카테고리와 공급사별 구매 지출을 분석해 물량 통합, 가격 편차, 분산 구매 같은 절감 기회를 찾는 방법과 대시보드를 제공합니다.'],
  'supplier-scorecard.html': ['공급업체 평가표(스코어카드) 만들기 | 항목·가중치·점수 기준 템플릿 — CBM Lab', '품질, 납기, 가격, 대응력 항목과 가중치로 공급사를 점수화하는 평가표를 만들고 인쇄합니다. 점수 기준 설계와 운영 요령을 정리했습니다.'],
  'tco-calculator.html': ['TCO 총소유비용 계산기 | 설비 구매가 vs 유지보수·에너지·처분비용 비교 — CBM Lab', '구매가뿐 아니라 운영, 유지보수, 가동 중단, 처분 비용까지 더한 총소유비용(TCO)으로 두 옵션을 비교합니다. 현재가치 계산 요령도 안내합니다.'],
  'worldclock.html': ['세계시간·시차 계산기 | 해외 거래처와 회의 가능 시간 찾기 — CBM Lab', '주요 도시의 현재 시각과 시차를 한눈에 확인하고, 해외 거래처와 겹치는 업무 시간을 찾아 회의 일정을 잡을 수 있습니다.'],
};
const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
let n = 0;
for (const [f, [t, d]] of Object.entries(M)) {
  if (!fs.existsSync(f)) { console.log('missing', f); continue; }
  let s = fs.readFileSync(f, 'utf8'), o = s;
  s = s.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(t)}</title>`);
  s = /<meta name="description"/.test(s) ? s.replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${esc(d)}"`) : s.replace('</title>', `</title>\n<meta name="description" content="${esc(d)}">`);
  s = s.replace(/<meta property="og:title" content="[^"]*"/, `<meta property="og:title" content="${esc(t)}"`).replace(/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${esc(d)}"`);
  if (s !== o) { fs.writeFileSync(f, s); n++; }
}
console.log('meta updated', n);
