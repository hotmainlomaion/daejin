-- 봇 판단 로그 (bot_events)
-- 목적: 봇이 매 캔들 평가마다 "무엇을 보고 무엇을 결정했는지"를 남겨,
--       유저가 화면에서 봇이 살아있음을 실시간으로 확인할 수 있게 한다.
--       (15분봉이면 체결이 없는 동안 화면이 15분간 죽어 보이는 문제 대응)
-- 원칙: 유저는 자기 봇의 이벤트만 읽는다(RLS). 워커는 service_role로 기록하며 RLS를 우회한다.

-- ── 봇 이벤트 ───────────────────────────────────────────
-- HOLD·ERROR를 포함한다는 점이 trades와 다르다. trades는 실제 체결만,
-- bot_events는 체결로 이어지지 않은 판단까지 전부 남긴다.
create type public.bot_event_action as enum ('LONG', 'SHORT', 'CLOSE', 'HOLD', 'ERROR');

create table public.bot_events (
  id         uuid primary key default gen_random_uuid(),
  bot_id     uuid not null references public.bots (id) on delete cascade,
  action     public.bot_event_action not null,
  -- 전략의 Signal.reason이 그대로 들어온다. 한국어 사유이며 시크릿을 넣지 않는다
  -- (CLAUDE.md 보안 가드레일 8).
  reason     text not null,
  -- 평가 시점의 확정 종가. 평가 전 단계에서 발생한 오류 등 가격이 없을 수 있어 nullable.
  price      numeric(20, 8),
  created_at timestamptz not null default now()
);

-- 대시보드의 "최근 이벤트 N건" 조회 전용 인덱스.
create index bot_events_bot_id_idx on public.bot_events (bot_id, created_at desc);

-- ⚠️ 이벤트 누적 문제 (MVP 미해결, 의도적으로 남겨둠)
-- 봇 1개가 15분봉이면 하루 96건, 1분봉이면 하루 1440건이 쌓인다. HOLD가 대부분이라
-- 봇 수 × 가동일에 비례해 테이블이 단조 증가하며, 지우는 주체가 아무도 없다.
-- 대응 후보(1주차 범위 밖):
--   1) pg_cron으로 보존 기간(예: 30일) 초과분 주기 삭제 — 가장 단순
--   2) created_at 기준 월 단위 파티셔닝 후 오래된 파티션 drop — 삭제 비용이 상수
--   3) 직전과 동일한 (action, reason)이면 기록을 건너뛰거나 카운트만 증가 — 워커 측 변경 필요
-- TODO(confirm): 보존 기간과 방식은 실제 이벤트 증가 속도를 관측한 뒤 정한다.

-- ── RLS ─────────────────────────────────────────────────
-- 워커(service_role)는 RLS를 우회하므로 insert 정책이 필요 없다.
-- 유저는 읽기만 하면 되므로 select 정책만 둔다 (trades/positions와 동일한 패턴).
alter table public.bot_events enable row level security;

create policy bot_events_select_own on public.bot_events
  for select to authenticated using (
    exists (select 1 from public.bots b where b.id = bot_events.bot_id and b.user_id = auth.uid())
  );
