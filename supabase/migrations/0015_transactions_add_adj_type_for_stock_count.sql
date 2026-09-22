-- 2026-09-21, Kevin 요청: IMMS에서 아직 재고가 안 잡힌(또는 실제 수량과 다른)
-- 품목을 현장에서 그 자리에서 바로 실사/보정할 수 있게. 재고는 절대 직접
-- 저장하지 않고 항상 transaction_details의 delta 합(stock_ledger)으로만
-- 계산하는 기존 설계(0001_init.sql)를 그대로 따르되, "진짜 매입/이동"이
-- 아닌 "실사 보정" 거래를 구분하기 위해 새 txn_type 'ADJ'를 추가한다.
-- ADJ는 계산된 재고와 실제 수량의 차이(delta)만큼만 기록하며, 방향에 따라
-- IN처럼(증가, to_location_code만) 또는 PRD처럼(감소, from_location_code만)
-- 둘 중 하나의 모양을 가진다 — MOV/SHP/RET처럼 양쪽 다 채우지 않는다.
--
-- E-Count 동기화 영향 없음: src/lib/ecount-flush.ts의 배치 푸시는
-- `.in("txn_type", ["PRD", "MOV", "RET"])`만 골라가므로 ADJ는 IN과 마찬가지로
-- 애초에 그 목록에 없어 자동으로 E-Count 전송 대상에서 제외된다(코드 변경 불필요).

alter table transactions drop constraint transactions_txn_type_check;
alter table transactions add constraint transactions_txn_type_check
  check (txn_type in ('IN', 'PRD', 'MOV', 'SHP', 'RET', 'ADJ'));

alter table transactions drop constraint txn_location_shape;
alter table transactions add constraint txn_location_shape check (
  (txn_type = 'IN'  and from_location_code is null     and to_location_code is not null) or
  (txn_type = 'PRD' and from_location_code is not null and to_location_code is null) or
  (txn_type in ('MOV', 'SHP', 'RET') and from_location_code is not null and to_location_code is not null) or
  (txn_type = 'ADJ' and (
    (from_location_code is not null and to_location_code is null) or
    (from_location_code is null and to_location_code is not null)
  ))
);
