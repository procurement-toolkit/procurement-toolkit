/**
 * CBM Lab — 도메인 규칙
 * 이 파일은 서버(Vercel 서버리스)에서만 실행되고 클라이언트로 절대 내려가지 않습니다.
 * "프롬프트를 잘 짰다"가 아니라 "20년 실무 규칙을 로직으로 박아뒀다"가 되게 하는 부분입니다.
 * 실제 사업화 단계에서는 여기 내용을 선생님의 실무 노하우로 계속 채워나가시면 됩니다.
 * (예시로 최소한의 골격만 넣어뒀습니다 — 실제 체크리스트/판단 기준으로 교체 필요)
 */

const SITUATION_GUIDES = {
  rfq: {
    label: 'RFQ / 견적 요청',
    checklist: [
      'MOQ, 리드타임, 결제조건, Incoterm을 명시적으로 질문에 포함',
      '샘플 가능 여부와 샘플 리드타임 별도 질문',
      '경쟁 견적을 받고 있다는 뉘앙스는 과하지 않게 1문장 이내로',
    ],
  },
  price_pushback: {
    label: '가격 인하 요청',
    checklist: [
      '숫자(목표 단가, 물량 확대 가능성 등) 없이 막연히 "싸게 해달라"고 하지 않는다',
      '장기 계약/물량 증가 등 상대가 응할 유인을 최소 1개 제시',
      '관계를 해치지 않는 선에서 대안(결제조건 조정 등)도 함께 언급',
    ],
  },
  price_increase_reject: {
    label: '가격 인상 통보 대응',
    checklist: [
      '인상 사유(원자재/환율 등)에 대한 근거 자료를 먼저 요청',
      '즉각 거절보다 단계적 적용/부분 수용 등 협상 여지를 열어둔다',
      '대체 공급처 검토 가능성은 위협조가 아니라 사실 전달 톤으로',
    ],
  },
  delay_followup: {
    label: '납기 지연 독촉',
    checklist: [
      '원래 약속된 납기일을 먼저 명시하고 현재 지연 상태를 객관적으로 기술',
      '패널티/클레임 조항이 계약에 있다면 언급하되 위협적이지 않게',
      '구체적인 새 납기일과 확인 방법(사진, 선적서류 등)을 요구',
    ],
  },
  quality_claim: {
    label: '품질 이슈 / 클레임',
    checklist: [
      '불량률/증빙(사진, 검사리포트) 요구를 명확히 포함',
      '재발 방지 대책(공정 개선, 검사 강화 등) 요청',
      '보상 방식(재작업/할인/재발송)에 대한 회사 입장을 먼저 밝히지 않고 상대 안을 먼저 요청',
    ],
  },
  sample_request: {
    label: '샘플 요청',
    checklist: [
      '샘플 비용/배송비 부담 주체를 명확히 질문',
      '샘플 승인 후 양산 리드타임과의 연계 여부 언급',
    ],
  },
};

const TONE_GUIDES = {
  firm_polite: '단호하지만 정중한 톤. 감정적 표현 없이 사실과 요구사항 중심으로.',
  soft: '관계 유지를 최우선으로 하는 부드러운 톤. 다만 요구사항은 명확히.',
  urgent: '긴급성을 강조하되 무례하지 않게. 데드라인을 구체적 날짜로 명시.',
};

function buildSystemPrompt({ situation, tone, context }) {
  const guide = SITUATION_GUIDES[situation] || SITUATION_GUIDES.rfq;
  const toneGuide = TONE_GUIDES[tone] || TONE_GUIDES.firm_polite;

  const contextLine = context && context.summary
    ? `사용자가 방금 계산기에서 얻은 결과: ${context.summary}\n원본 수치 데이터: ${JSON.stringify(context.data)}`
    : '계산기 연동 데이터 없음. 사용자 입력만으로 작성.';

  return [
    '당신은 20년 이상 해외 구매/글로벌 소싱/물류 실무 경험을 가진 전문가를 대신해',
    '영문 비즈니스 이메일 초안을 작성하는 어시스턴트입니다.',
    '',
    `상황: ${guide.label}`,
    `이 상황에서 반드시 지킬 실무 체크리스트:`,
    ...guide.checklist.map((c) => `- ${c}`),
    '',
    `톤 가이드: ${toneGuide}`,
    '',
    contextLine,
    '',
    '출력은 영문 이메일 본문만 작성하고, 제목(Subject)도 한 줄 포함하세요.',
    '불필요한 서론 없이 바로 이메일 형식으로 출력하세요.',
  ].join('\n');
}

module.exports = { buildSystemPrompt, SITUATION_GUIDES, TONE_GUIDES };
