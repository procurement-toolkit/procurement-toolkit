/**
 * CBM Lab — POST /api/webhook-stripe
 * Stripe 결제 완료(checkout.session.completed) 시 호출되는 웹훅.
 * 라이선스 키를 생성해 DB(KV)에 저장합니다.
 *
 * 설정 순서:
 * 1) Stripe 대시보드에서 Payment Link 생성 (Pro $24/월, Team $79/월 등 Price 등록)
 * 2) Stripe 대시보드 > Developers > Webhooks 에서
 *    엔드포인트: https://your-domain.vercel.app/api/webhook-stripe
 *    이벤트: checkout.session.completed 선택
 * 3) 발급된 Signing secret을 Vercel 환경변수 STRIPE_WEBHOOK_SECRET에 등록
 * 4) Stripe Secret Key를 STRIPE_SECRET_KEY에 등록
 *
 * ⚠️ 이메일로 라이선스 키 발송 부분은 실제 이메일 서비스(Resend, SendGrid 등)
 *    연동이 필요합니다. 여기서는 콘솔 로그로 표시만 하니, 실제 배포 전 반드시
 *    이메일 발송 로직으로 교체하세요. (Stripe 세션의 customer_details.email 사용)
 */

const Stripe = require('stripe');
const { v4: uuidv4 } = require('uuid');
const { createLicense } = require('./_lib/quota');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Vercel에서 웹훅 서명 검증을 위해 raw body가 필요 — bodyParser 비활성화
module.exports.config = {
  api: { bodyParser: false },
};

function buffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Stripe Price ID <-> 내부 플랜명 매핑 (실제 Price ID로 교체 필요)
const PRICE_TO_PLAN = {
  price_XXXXXXXXXXXXPro: 'pro',
  price_XXXXXXXXXXXXTeam: 'team',
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const sig = req.headers['stripe-signature'];
  const rawBody = await buffer(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[webhook-stripe] 서명 검증 실패:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_details && session.customer_details.email;

    // 세션에서 구매한 price ID 조회 (line_items expand 필요할 수 있음 — 간단화된 예시)
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
    const priceId = lineItems.data[0] && lineItems.data[0].price && lineItems.data[0].price.id;
    const plan = PRICE_TO_PLAN[priceId] || 'pro';

    const licenseKey = `cbmlab-${uuidv4().split('-')[0]}`;
    await createLicense(licenseKey, plan);

    // TODO: 실제 이메일 발송 로직으로 교체
    console.log(`[webhook-stripe] 신규 라이선스 발급: ${licenseKey} (${plan}) -> ${email}`);
  }

  return res.status(200).json({ received: true });
};
