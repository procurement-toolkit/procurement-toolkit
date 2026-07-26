/**
 * update-naewichi-views.mjs
 *
 * 내위치(naewichi) 각 페이지의 Vercel Web Analytics 조회수를 가져와서
 * naewichi/items.json 의 views 값을 실제 데이터로 갱신합니다.
 *
 * 필요한 환경변수 (GitHub Actions Secrets로 등록):
 *   VERCEL_TOKEN      - Vercel 계정 설정 > Tokens 에서 발급한 액세스 토큰
 *   VERCEL_PROJECT_ID - 프로젝트 설정 > General 에서 확인 가능한 Project ID
 *   VERCEL_TEAM_ID    - (개인 계정 프로젝트면 생략 가능, 팀 프로젝트면 필요)
 *
 * 참고: Vercel Web Analytics REST API는 2026년 5월 공개 베타로 출시되었습니다.
 * 정확한 파라미터(기간 지정 등)는 계정 상황에 따라 다를 수 있으니,
 * 실행 후 응답을 한 번 콘솔에 찍어보고 vercel.com/docs/analytics/web-analytics-api
 * 문서와 대조해서 맞춰 쓰는 걸 추천합니다.
 */

import { readFile, writeFile } from 'fs/promises';

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const PROJECT_ID = process.env.VERCEL_PROJECT_ID;
const TEAM_ID = process.env.VERCEL_TEAM_ID; // 없으면 undefined로 두고 요청에서 제외

const ITEMS_JSON_PATH = new URL('../naewichi/items.json', import.meta.url);
const BASE_PATH = '/naewichi/'; // 실제 배포 경로에 맞게 조정 (예: 루트 도메인 기준)

if (!VERCEL_TOKEN || !PROJECT_ID) {
  console.error('VERCEL_TOKEN과 VERCEL_PROJECT_ID 환경변수가 필요합니다.');
  process.exit(1);
}

async function fetchPageviews(requestPath) {
  const url = new URL('https://api.vercel.com/v1/query/web-analytics/visits/count');
  url.searchParams.set('projectId', PROJECT_ID);
  if (TEAM_ID) url.searchParams.set('teamId', TEAM_ID);
  url.searchParams.set('filter', `requestPath eq '${requestPath}'`);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  });

  if (!res.ok) {
    console.error(`요청 실패 (${requestPath}):`, res.status, await res.text());
    return null;
  }

  const json = await res.json();
  // 응답 형태: { version:1, query:{...}, data:{ pageviews: N, visitors: N } }
  return json?.data?.pageviews ?? null;
}

async function main() {
  const raw = await readFile(ITEMS_JSON_PATH, 'utf-8');
  const db = JSON.parse(raw);

  let changed = false;

  for (const item of db.items) {
    const requestPath = BASE_PATH + item.url.replace(/\.html$/, '.html');
    const pageviews = await fetchPageviews(requestPath);

    if (pageviews !== null && pageviews !== item.views) {
      console.log(`${item.title}: ${item.views} -> ${pageviews}`);
      item.views = pageviews;
      changed = true;
    }
  }

  if (changed) {
    await writeFile(ITEMS_JSON_PATH, JSON.stringify(db, null, 2) + '\n', 'utf-8');
    console.log('items.json 갱신 완료');
  } else {
    console.log('변경된 조회수 없음, items.json 그대로 유지');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
