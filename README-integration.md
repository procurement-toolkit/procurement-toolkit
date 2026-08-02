# CBM Lab AI 코파일럿 — 배포 가이드

## 1. 파일 업로드 위치 (GitHub 웹 UI 기준)

기존 flat 저장소 구조에 아래처럼 추가하시면 됩니다. GitHub "Add file" > "Create new file"에서
파일명 입력란에 전체 경로(`api/generate.js` 등)를 그대로 타이핑하면 폴더가 자동 생성됩니다.

```
your-repo/
├── (기존 계산기 HTML 파일들 그대로)
├── email-copilot.html          ← 신규
├── handoff-schema.md           ← 신규 (문서, 사이트에는 안 올라감)
├── package.json                ← 신규
├── assets/
│   └── js/
│       └── ai-handoff.js       ← 신규
└── api/
    ├── generate.js              ← 신규
    ├── webhook-stripe.js        ← 신규
    └── _lib/
        ├── quota.js             ← 신규
        └── domain-rules.js      ← 신규 (핵심 — 여기에 실무 노하우 채워넣기)
```

`snippet-calculator-button.html`은 그대로 올리는 파일이 아니라, 기존 계산기 페이지
(`fob-cif.html` 등) 안에 복사해 넣을 참고용 코드입니다.

## 2. Vercel 환경변수 설정

Vercel 대시보드 > 프로젝트 > Settings > Environment Variables 에서:

| 변수명 | 용도 | 발급처 |
|---|---|---|
| `ANTHROPIC_API_KEY` | AI 호출 | console.anthropic.com |
| `STRIPE_SECRET_KEY` | 결제 확인 | Stripe 대시보드 |
| `STRIPE_WEBHOOK_SECRET` | 웹훅 서명 검증 | Stripe 웹훅 설정 화면 |

`KV_REST_API_URL`, `KV_REST_API_TOKEN`은 Vercel 대시보드 > Storage > KV에서
데이터베이스를 하나 추가(무료 티어 있음)하면 자동으로 프로젝트에 연결/주입됩니다.

## 3. Stripe 설정

1. Stripe 대시보드에서 Product 2개 생성: Pro ($24/월), Team ($79/월)
2. 각 Product의 Payment Link 생성 → `email-copilot.html`의 "Pro 플랜 안내" 링크에 연결
3. `api/webhook-stripe.js`의 `PRICE_TO_PLAN` 객체를 실제 Price ID로 교체
4. Developers > Webhooks에서 엔드포인트 등록: `https://[도메인]/api/webhook-stripe`, 이벤트 `checkout.session.completed`

## 4. 테스트 순서 (배포 전)

1. `npm install` 로컬 실행 후 `vercel dev`로 로컬 서버 구동
2. KV 미설정 상태로도 메모리 폴백으로 동작하는지 확인 (재시작하면 초기화되는 건 정상)
3. 테스트용 라이선스 키를 수동으로 KV에 넣거나, `quota.js`의 `createLicense()`를
   임시 스크립트로 호출해 `cbmlab-test123` 같은 키 발급
4. `email-copilot.html`에서 해당 키로 생성 요청 → 응답 확인
5. Stripe 테스트 모드 결제로 웹훅 → 라이선스 자동 발급까지 end-to-end 확인

## 5. 다음으로 채워야 할 것 (코드가 아니라 콘텐츠)

- `api/_lib/domain-rules.js`의 체크리스트를 실제 20년 경력 기준으로 구체화
  (지금은 골격만 있는 예시 상태입니다 — 이게 채워질수록 ChatGPT와의 차별점이 생깁니다)
- 나머지 계산기 페이지에도 `snippet-calculator-button.html` 방식으로 handoff 버튼 추가
- 이메일 발송(Resend 등) 연동 — 지금은 라이선스 키가 콘솔 로그에만 찍힘
- `email-copilot.html`과 같은 패턴으로 "견적 비교 요약기", "클레임 대응 생성기" 페이지 복제
  (situation 옵션만 늘리면 되므로 API/DB 쪽은 수정 불필요)
