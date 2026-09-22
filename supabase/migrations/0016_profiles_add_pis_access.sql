-- 2026-09-21, Kevin 요청: "현장 작업자라도 pis로 넘어 갈 수 있는 접근권한을
-- 관리자가 주거나 막을 수 있도록" — 기존 profiles.role('admin'|'field')과는
-- 별개로, 특정 현장(field) 계정에게 개별적으로 PIS(관리자 웹, /admin의 "업무"
-- 화면들) 접근을 허용/해제할 수 있는 컬럼. role='admin'은 항상 전체 접근
-- (관리 화면 포함) 그대로 유지되고, 이 플래그는 role='field' 계정에만 의미가
-- 있다 — true면 PIS "업무" 화면만 볼 수 있고 "관리"(사용자 관리 등) 화면은
-- 여전히 admin만 접근 가능.
alter table profiles add column if not exists pis_access boolean not null default false;
comment on column profiles.pis_access is '현장(field) 계정에 개별적으로 부여하는 PIS 업무화면 접근 권한. role=admin은 이 값과 무관하게 항상 전체 접근.';
