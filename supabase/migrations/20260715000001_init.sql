-- FuturesLab 초기 스키마 (PRD §5.2)
-- 원칙: 유저는 자기 데이터만 접근(RLS). 워커는 service_role로 RLS를 우회한다.
-- ⚠️ exchange_keys의 키·시크릿은 암호문만 저장하며, 클라이언트로 절대 반환하지 않는다
--    (CLAUDE.md 보안 가드레일 5·6).

-- ── 거래소 키 (테스트넷 전용) ───────────────────────────
create table public.exchange_keys (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  label             text not null default '테스트넷 키',
  -- 애플리케이션 레이어에서 AES-256-GCM으로 암호화한 값. 평문 저장 금지.
  encrypted_api_key text not null,
  encrypted_secret  text not null,
  created_at        timestamptz not null default now()
);

create index exchange_keys_user_id_idx on public.exchange_keys (user_id);

-- ── 전략 ────────────────────────────────────────────────
create type public.template_type as enum ('ma_crossover', 'volatility_breakout', 'rsi');

create table public.strategies (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null,
  template_type public.template_type not null,
  -- 템플릿별 파라미터. 스키마 검증은 애플리케이션(/shared)에서 수행한다.
  params        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index strategies_user_id_idx on public.strategies (user_id);

-- ── 봇 ──────────────────────────────────────────────────
-- 웹앱과 워커는 오직 이 테이블의 status를 통해서만 통신한다 (CLAUDE.md 아키텍처 규칙).
create type public.bot_status as enum ('stopped', 'running', 'error');

create table public.bots (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  strategy_id     uuid not null references public.strategies (id) on delete restrict,
  exchange_key_id uuid not null references public.exchange_keys (id) on delete restrict,
  symbol          text not null default 'BTCUSDT',
  timeframe       text not null default '15m',
  leverage        int  not null default 3 check (leverage between 1 and 125),
  status          public.bot_status not null default 'stopped',
  -- status='error'일 때 사용자에게 보여줄 사유. 시크릿을 넣지 않는다.
  last_error      text,
  started_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index bots_user_id_idx on public.bots (user_id);
create index bots_status_idx on public.bots (status);

-- ── 체결 기록 ───────────────────────────────────────────
create type public.trade_side as enum ('BUY', 'SELL');

create table public.trades (
  id           uuid primary key default gen_random_uuid(),
  bot_id       uuid not null references public.bots (id) on delete cascade,
  side         public.trade_side not null,
  price        numeric(20, 8) not null,
  qty          numeric(20, 8) not null,
  fee          numeric(20, 8) not null default 0,
  funding      numeric(20, 8) not null default 0,
  -- 바이낸스 orderId. 재시작 시 중복 기록 방지에 사용한다.
  exchange_order_id text,
  executed_at  timestamptz not null default now()
);

create index trades_bot_id_idx on public.trades (bot_id, executed_at desc);
create unique index trades_exchange_order_id_key
  on public.trades (bot_id, exchange_order_id)
  where exchange_order_id is not null;

-- ── 포지션 ──────────────────────────────────────────────
-- 봇당 심볼 1개(MVP). 워커가 테스트넷 조회 결과로 갱신한다.
create table public.positions (
  id                uuid primary key default gen_random_uuid(),
  bot_id            uuid not null references public.bots (id) on delete cascade,
  symbol            text not null,
  entry_price       numeric(20, 8) not null,
  qty               numeric(20, 8) not null,
  unrealized_pnl    numeric(20, 8) not null default 0,
  realized_pnl      numeric(20, 8) not null default 0,
  liquidation_price numeric(20, 8),
  updated_at        timestamptz not null default now()
);

create unique index positions_bot_symbol_key on public.positions (bot_id, symbol);

-- ── updated_at 자동 갱신 ────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger bots_touch_updated_at
  before update on public.bots
  for each row execute function public.touch_updated_at();

create trigger positions_touch_updated_at
  before update on public.positions
  for each row execute function public.touch_updated_at();

-- ── RLS ─────────────────────────────────────────────────
-- 전 테이블 RLS 활성화. service_role(워커)은 RLS를 우회하므로 별도 정책이 필요 없다.
alter table public.exchange_keys enable row level security;
alter table public.strategies    enable row level security;
alter table public.bots          enable row level security;
alter table public.trades        enable row level security;
alter table public.positions     enable row level security;

-- exchange_keys
-- 등록(암호화)은 서버 액션이 service_role로 수행하므로 authenticated에 insert 권한을 주지 않는다.
-- 유저에게는 "키가 등록되어 있다"는 사실(label)만 보이면 되고, 암호문조차 내보내지 않는다.
-- RLS만으로는 컬럼을 가릴 수 없으므로 **컬럼 단위 권한**으로 암호문을 차단한다
-- (CLAUDE.md 보안 가드레일 6).
revoke all on public.exchange_keys from anon, authenticated;
grant select (id, user_id, label, created_at) on public.exchange_keys to authenticated;
grant delete on public.exchange_keys to authenticated;

create policy exchange_keys_select_own on public.exchange_keys
  for select to authenticated using (auth.uid() = user_id);
create policy exchange_keys_delete_own on public.exchange_keys
  for delete to authenticated using (auth.uid() = user_id);

-- strategies / bots: 유저 본인 것만 전체 접근.
create policy strategies_all_own on public.strategies
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy bots_all_own on public.bots
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- trades / positions: 워커만 기록한다. 유저는 자기 봇 것만 읽는다.
create policy trades_select_own on public.trades
  for select to authenticated using (
    exists (select 1 from public.bots b where b.id = trades.bot_id and b.user_id = auth.uid())
  );

create policy positions_select_own on public.positions
  for select to authenticated using (
    exists (select 1 from public.bots b where b.id = positions.bot_id and b.user_id = auth.uid())
  );
