/**
 * CBM Lab — 라이선스/사용량 체크
 * Vercel KV(Upstash Redis 기반, Vercel 대시보드에서 무료로 추가 가능)를 사용합니다.
 * KV 환경변수(KV_REST_API_URL, KV_REST_API_TOKEN)가 없으면 메모리 기반으로 폴백합니다.
 * ⚠️ 메모리 폴백은 서버리스 함수 재시작 시 초기화되므로 로컬 테스트 전용입니다.
 *    실제 서비스에서는 반드시 Vercel KV(또는 Supabase)를 연결하세요.
 */

let kv = null;
try {
  // @vercel/kv 패키지가 설치되어 있고 환경변수가 있으면 사용
  if (process.env.KV_REST_API_URL) {
    kv = require('@vercel/kv').kv;
  }
} catch (e) {
  kv = null;
}

// 로컬/미설정 폴백용 인메모리 스토어
const memStore = new Map();

const PLAN_LIMITS = {
  free: 10,
  pro: 300,
  team: 1500,
};

function currentPeriodKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function getRecord(licenseKey) {
  const storeKey = `license:${licenseKey}`;
  if (kv) {
    const record = await kv.get(storeKey);
    return record || null;
  }
  return memStore.get(storeKey) || null;
}

async function setRecord(licenseKey, record) {
  const storeKey = `license:${licenseKey}`;
  if (kv) {
    await kv.set(storeKey, record);
  } else {
    memStore.set(storeKey, record);
  }
}

/**
 * 라이선스 키를 확인하고, 이번 달 사용량이 한도 이내면 카운트를 1 증가시킨다.
 * 반환: { ok: true, plan, remaining } 또는 { ok: false, status, message }
 */
async function checkAndIncrement(licenseKey) {
  if (!licenseKey) {
    return { ok: false, status: 401, message: '라이선스 키가 필요합니다.' };
  }

  const record = await getRecord(licenseKey);

  if (!record) {
    return { ok: false, status: 404, message: '유효하지 않은 라이선스 키입니다.' };
  }

  const period = currentPeriodKey();
  const limit = PLAN_LIMITS[record.plan] || PLAN_LIMITS.free;

  // 월이 바뀌었으면 카운트 리셋
  if (record.period !== period) {
    record.period = period;
    record.used = 0;
  }

  if (record.used >= limit) {
    return {
      ok: false,
      status: 429,
      message: `이번 달 사용 한도(${limit}회)를 모두 사용했습니다. 플랜 업그레이드를 검토해주세요.`,
    };
  }

  record.used += 1;
  await setRecord(licenseKey, record);

  return { ok: true, plan: record.plan, remaining: limit - record.used };
}

/**
 * 결제 완료 후 웹훅에서 호출 — 신규 라이선스 발급
 */
async function createLicense(licenseKey, plan) {
  await setRecord(licenseKey, {
    plan,
    period: currentPeriodKey(),
    used: 0,
    createdAt: new Date().toISOString(),
  });
}

module.exports = { checkAndIncrement, createLicense, PLAN_LIMITS };
