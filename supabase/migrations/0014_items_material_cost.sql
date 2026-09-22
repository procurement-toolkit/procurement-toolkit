-- 2026-09-21, Kevin 요청("E-Count에서 더 끌어올 수 있는 자료가 있는지 확인")에
-- 따라 재확인하다가 발견: 이카운트 품목조회(GetBasicProductsList)는 이미 매
-- 동기화마다 MATERIAL_COST(재료비표준원가) 필드를 응답에 포함해서 주고
-- 있었는데(src/lib/ecount.ts EcountItemMasterRow 타입에 원래 있던 필드),
-- 저장할 컬럼이 없어 지금까지 그냥 버려지고 있었다 — 새 API 연동이 전혀
-- 필요 없는, 이미 받아오던 데이터. 이 값을 items.material_cost로 저장해
-- "표준원가 대비 실제 입고단가" 비교(06 가격분석 보강)에 쓴다.
--
-- 주의: 이건 E-Count ERP에 담당자가 입력해둔 "표준원가"이지 실제 매입
-- 이력에서 계산한 값이 아니다 — 회사가 이 필드를 꾸준히 관리하지 않았다면
-- 오래되거나 비어있을 수 있다(price_history처럼 매일 실측되는 값과는
-- 성격이 다름). 화면에서도 이 한계를 그대로 노출한다.
alter table items add column if not exists material_cost numeric;
comment on column items.material_cost is '이카운트 품목조회(MATERIAL_COST, 재료비표준원가) — ERP에 등록된 표준원가 값, 실제 매입 이력 기반 아님. 2026-09-21 추가.';
