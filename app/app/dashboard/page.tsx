import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BotControls } from '@/components/BotControls';
import { TestnetNotice } from '@/components/TestnetNotice';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// 워커가 DB를 갱신하므로 캐시하지 않는다. MVP는 폴링 대신 요청마다 최신값을 읽는다.
export const dynamic = 'force-dynamic';

interface PositionRow {
  symbol: string;
  entry_price: number;
  qty: number;
  unrealized_pnl: number;
  liquidation_price: number | null;
}

interface BotRow {
  id: string;
  symbol: string;
  timeframe: string;
  leverage: number;
  status: string;
  last_error: string | null;
  strategies: { name: string } | null;
  positions: PositionRow[];
}

/** 성과 대시보드 (PRD F7): 포지션·손익·청산가·펀딩비. */
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
    .select('id, symbol, timeframe, leverage, status, last_error, strategies(name), positions(*)')
    .order('created_at', { ascending: false });

  const bots = (data ?? []) as unknown as BotRow[];

  return (
    <main className="space-y-8">
      <header className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">대시보드</h1>
          <p className="text-sm text-neutral-500">테스트넷에서 실행 중인 봇의 상태입니다.</p>
        </div>
        <Link
          href="/bots/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
        >
          봇 만들기
        </Link>
      </header>

      <TestnetNotice />

      {bots.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 px-6 py-16 text-center">
          <p className="text-sm text-neutral-600">아직 만든 봇이 없습니다.</p>
          <Link
            href="/bots/new"
            className="mt-3 inline-block text-sm font-medium text-neutral-900 underline underline-offset-4"
          >
            첫 봇 만들기
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {bots.map((bot) => (
            <BotCard key={bot.id} bot={bot} />
          ))}
        </ul>
      )}
    </main>
  );
}

function BotCard({ bot }: { bot: BotRow }) {
  const position = bot.positions[0] ?? null;

  return (
    <li className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">{bot.strategies?.name ?? '전략'}</h2>
            <StatusBadge status={bot.status} />
          </div>
          <p className="text-sm text-neutral-500">
            {bot.symbol} · {bot.timeframe} · {bot.leverage}x
          </p>
        </div>
        <BotControls botId={bot.id} status={bot.status} />
      </div>

      {bot.status === 'error' && bot.last_error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-loss">{bot.last_error}</p>
      )}

      {bot.status === 'running' && !position && (
        <p className="text-sm text-neutral-500">
          포지션 없음 — 진입 조건을 기다리는 중입니다. 평가는 캔들 종가마다 이루어집니다.
        </p>
      )}

      {position && (
        <dl className="grid grid-cols-2 gap-4 border-t border-neutral-100 pt-4 sm:grid-cols-4">
          <Stat label="방향" value={position.qty > 0 ? '롱' : '숏'} />
          <Stat label="진입가" value={formatUsd(position.entry_price)} />
          <Stat
            label="미실현 손익"
            value={formatSignedUsd(position.unrealized_pnl)}
            tone={position.unrealized_pnl >= 0 ? 'profit' : 'loss'}
          />
          <Stat
            label="청산가"
            value={position.liquidation_price ? formatUsd(position.liquidation_price) : '—'}
          />
        </dl>
      )}
    </li>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    running: 'bg-emerald-50 text-emerald-700',
    stopped: 'bg-neutral-100 text-neutral-600',
    error: 'bg-red-50 text-red-700',
  };
  const labels: Record<string, string> = {
    running: '실행 중',
    stopped: '정지',
    error: '오류',
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles.stopped}`}>
      {labels[status] ?? status}
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'profit' | 'loss' }) {
  const toneClass = tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-neutral-900';
  return (
    <div className="space-y-1">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className={`text-sm font-medium tabular-nums ${toneClass}`}>{value}</dd>
    </div>
  );
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}`;
}

function formatSignedUsd(value: number): string {
  const sign = value >= 0 ? '+' : '−';
  return `${sign}$${Math.abs(value).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}`;
}
