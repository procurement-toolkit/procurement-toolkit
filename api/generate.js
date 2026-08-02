/**
 * CBM Lab — POST /api/generate
 * 이메일 코파일럿 페이지에서 호출하는 메인 엔드포인트.
 * 1) 라이선스/쿼터 확인
 * 2) 도메인 규칙 기반 시스템 프롬프트 구성
 * 3) Anthropic API 호출
 * 4) 결과 반환
 *
 * 필요 환경변수 (Vercel 대시보드 > Settings > Environment Variables):
 *   ANTHROPIC_API_KEY
 *   KV_REST_API_URL, KV_REST_API_TOKEN (Vercel KV 연결 시 자동 주입됨)
 */

const Anthropic = require('@anthropic-ai/sdk');
const { checkAndIncrement } = require('./_lib/quota');
const { buildSystemPrompt } = require('./_lib/domain-rules');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'POST만 허용됩니다.' });
  }

  const { license_key, situation, tone, extra, context } = req.body || {};

  // 1) 라이선스/쿼터 확인
  const quota = await checkAndIncrement(license_key);
  if (!quota.ok) {
    return res.status(quota.status).json({ message: quota.message });
  }

  // 2) 시스템 프롬프트 구성 (도메인 규칙 파일에서)
  const systemPrompt = buildSystemPrompt({ situation, tone, context });

  const userMessage = extra && extra.trim()
    ? `추가로 전달할 내용: ${extra.trim()}`
    : '추가 전달 사항 없음. 위 상황과 규칙에 맞게 작성해줘.';

  try {
    // 3) Anthropic API 호출
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    // 4) 결과 반환
    return res.status(200).json({ text, remaining: quota.remaining });
  } catch (err) {
    console.error('[api/generate] Anthropic API 오류:', err);
    return res.status(502).json({ message: 'AI 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' });
  }
};
