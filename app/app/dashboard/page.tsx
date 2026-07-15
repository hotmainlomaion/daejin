import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MA_CROSSOVER_DEFAULTS, type BotEvent } from '@futureslab/shared';
import { Terminal, type TerminalBot } from '@/components/Terminal';
import type { PositionView, TradeView } from '@/components/BottomTabs';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// 워커가 DB를 갱신하므로 캐시하지 않는다.
export const dynamic = 'force-dynamic';

interface BotRow {
  id: string;
  symbol: string;
  timeframe: string;
  leverage: number;
  status: 'stopped' | 'running' | 'error';
  last_error: string | null;
  strategies: { name: string; params: Record<string, unknown> } | null;
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: keys } = await supabase.from('exchange_keys').select('id').limit(1);
  if (!keys || keys.length === 0) redirect('/keys');

  const { data } = await supabase
    .from('bots')
    .select('id, symbol, timeframe, leverage, status, last_error, strategies(name, params)')
    .order('created_at', { ascending: false })
    .limit(1);

  const row = (data?.[0] ?? null) as BotRow | null;
  if (!row) redirect('/bots/new');

  const [{ data: positions }, { data: trades }, { data: events }] = await Promise.all([
    supabase.from('positions').select('*').eq('bot_id', row.id),
    supabase.from('trades').select('*').eq('bot_id', row.id).order('executed_at', { ascending: false }).limit(100),
    // 최근 100건만. 그 이상은 화면에서 의미가 없고, 이벤트는 계속 쌓인다
    // (보존 정책은 마이그레이션의 TODO(confirm) 참조).
    supabase
      .from('bot_events')
      .select('*')
      .eq('bot_id', row.id)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  const p = (row.strategies?.params ?? {}) as Record<string, unknown>;
  const num = (k: string, fallback: number) => (typeof p[k] === 'number' ? (p[k] as number) : fallback);

  const bot: TerminalBot = {
    id: row.id,
    name: row.strategies?.name ?? '전략',
    symbol: row.symbol,
    timeframe: row.timeframe,
    status: row.status,
    lastError: row.last_error,
    config: {
      positionSizePct: num('positionSizePct', MA_CROSSOVER_DEFAULTS.positionSizePct),
      leverage: row.leverage,
      stopLossPct: num('stopLossPct', MA_CROSSOVER_DEFAULTS.stopLossPct),
      takeProfitPct: num('takeProfitPct', MA_CROSSOVER_DEFAULTS.takeProfitPct),
      fastPeriod: num('fastPeriod', MA_CROSSOVER_DEFAULTS.fastPeriod),
      slowPeriod: num('slowPeriod', MA_CROSSOVER_DEFAULTS.slowPeriod),
      maType: p.maType === 'SMA' ? 'SMA' : 'EMA',
      onDeadCross: p.onDeadCross === 'SHORT' ? 'SHORT' : 'CLOSE_ONLY',
    },
  };

  const positionViews: PositionView[] = (positions ?? []).map((x) => ({
    symbol: x.symbol,
    qty: Number(x.qty),
    entryPrice: Number(x.entry_price),
    unrealizedPnl: Number(x.unrealized_pnl),
    liquidationPrice: x.liquidation_price === null ? null : Number(x.liquidation_price),
  }));

  const tradeViews: TradeView[] = (trades ?? []).map((x) => ({
    side: x.side,
    price: Number(x.price),
    qty: Number(x.qty),
    executedAt: x.executed_at,
  }));

  const eventViews: BotEvent[] = (events ?? []).map((x) => ({
    id: x.id,
    botId: x.bot_id,
    action: x.action,
    reason: x.reason,
    price: x.price === null ? null : Number(x.price),
    createdAt: x.created_at,
  }));

  return (
    <>
      <Terminal
        bot={bot}
        positions={positionViews}
        trades={tradeViews}
        events={eventViews}
        // 잔고는 유저 키를 복호화해야 얻을 수 있어 클라이언트가 /api/account로 가져온다.
        // 서버 컴포넌트에서 하면 첫 페인트가 바이낸스 응답만큼 늦어진다.
        account={null}
      />
      {/* 봇이 하나뿐인 MVP라 목록 화면 대신 새 봇 만들기 링크만 둔다 */}
      <Link
        href="/bots/new"
        className="fixed bottom-3 left-4 z-10 text-[11px] text-faint hover:text-ink"
      >
        + 새 봇 만들기
      </Link>
    </>
  );
}
