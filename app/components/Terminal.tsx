'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BotEvent, Candle } from '@futureslab/shared';
import { saveBotConfig, setBotStatus } from '@/app/actions';
import { BotPanel, type BotConfig } from '@/components/BotPanel';
import { BottomTabs, type PositionView, type TradeView } from '@/components/BottomTabs';
import { PriceChart, type TradeMarker } from '@/components/PriceChart';
import {
  MAIN_INDICATORS,
  SUB_INDICATORS,
  mainMeta,
  subMeta,
  type MainIndicator,
  type SubIndicator,
} from '@/lib/indicators';
import { TestnetNotice } from '@/components/TestnetNotice';
import { useBotStream } from '@/lib/useBotStream';

export interface TerminalBot {
  id: string;
  name: string;
  symbol: string;
  timeframe: string;
  status: 'stopped' | 'running' | 'error';
  lastError: string | null;
  config: BotConfig;
}

export interface AccountView {
  walletBalance: number;
  availableBalance: number;
  unrealizedPnl: number;
}

const SYMBOLS = ['BTCUSDT', 'ETHUSDT'];
const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h'];

/** 마크 가격 폴링 주기. 손익이 살아 움직이는 느낌을 주되 과하지 않게. */
const TICKER_MS = 3_000;
/** 캔들 갱신 주기. 봇이 종가에만 판단하므로 초 단위일 필요가 없다. */
const CANDLE_MS = 15_000;

/**
 * 트레이딩 터미널 (CLAUDE.md §디자인 톤 — KuCoin Futures Lite 기준).
 *
 * 실시간성은 세 갈래로 나뉜다:
 *  - 마크 가격 → 3초 폴링. 미실현 손익이 초 단위로 움직인다.
 *  - 캔들      → 15초 폴링. 봇이 종가에만 판단하므로 이 정도면 충분하다.
 *  - 봇의 행동 → Supabase Realtime. 워커가 DB에 쓰는 순간 화면이 반응한다 (폴링 아님).
 */
export function Terminal({
  bot,
  positions,
  trades,
  events: initialEvents,
  account: initialAccount,
}: {
  bot: TerminalBot;
  positions: PositionView[];
  trades: TradeView[];
  events: BotEvent[];
  account: AccountView | null;
}) {
  const router = useRouter();
  const [symbol, setSymbol] = useState(bot.symbol);
  const [timeframe, setTimeframe] = useState(bot.timeframe);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [markPrice, setMarkPrice] = useState<number | null>(null);
  const [account, setAccount] = useState<AccountView | null>(initialAccount);
  const [config, setConfig] = useState<BotConfig>(bot.config);
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // 거래소처럼 여러 지표를 동시에 켠다. 서브는 선택한 순서대로 패인이 아래로 쌓인다.
  const [subIndicators, setSubIndicators] = useState<SubIndicator[]>(['volume']);
  const [mainIndicators, setMainIndicators] = useState<MainIndicator[]>([]);

  const { events, connected } = useBotStream(bot.id, initialEvents);

  // ── 캔들 ───────────────────────────────────────────────
  const loadCandles = useCallback(async () => {
    try {
      const res = await fetch(`/api/klines?symbol=${symbol}&interval=${timeframe}&limit=200`);
      const json = await res.json();
      if (!res.ok) return setLoadError(json.error ?? '시세를 불러오지 못했습니다.');
      setCandles(json.candles);
      setLoadError(null);
    } catch {
      setLoadError('시세 서버에 연결할 수 없습니다.');
    }
  }, [symbol, timeframe]);

  useEffect(() => {
    void loadCandles();
    const timer = setInterval(() => void loadCandles(), CANDLE_MS);
    return () => clearInterval(timer);
  }, [loadCandles]);

  // ── 마크 가격 (실시간 손익용) ──────────────────────────
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/ticker?symbol=${symbol}`);
        if (!res.ok) return;
        const json = await res.json();
        if (alive) setMarkPrice(json.markPrice);
      } catch {
        // 일시적 실패는 무시한다 — 다음 주기에 다시 받는다
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), TICKER_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [symbol]);

  // ── 계정 잔고 ──────────────────────────────────────────
  const loadAccount = useCallback(async () => {
    try {
      const res = await fetch('/api/account');
      if (!res.ok) return;
      setAccount(await res.json());
    } catch {
      // 잔고 조회 실패로 화면을 막지 않는다
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => void loadAccount(), 10_000);
    return () => clearInterval(timer);
  }, [loadAccount]);

  // ── 파생값 ─────────────────────────────────────────────
  const lastCandle = candles[candles.length - 1];
  const price = markPrice ?? lastCandle?.close ?? null;
  const first = candles[0];
  const changePct = price && first ? ((price - first.open) / first.open) * 100 : 0;
  const up = changePct >= 0;

  /**
   * 미실현 손익을 마크 가격으로 다시 계산한다.
   * DB의 값은 워커가 캔들 종가마다 갱신하므로 15분봉이면 15분 동안 멈춰 있다.
   * 화면에서는 초 단위로 움직여야 "실시간으로 돌고 있다"는 게 보인다.
   * (수량 부호가 방향을 담고 있어 롱/숏 모두 같은 식으로 계산된다)
   */
  const livePositions = useMemo<PositionView[]>(() => {
    if (price === null) return positions;
    return positions.map((p) => ({
      ...p,
      unrealizedPnl: (price - p.entryPrice) * p.qty,
    }));
  }, [positions, price]);

  const markers: TradeMarker[] = useMemo(
    () =>
      trades.map((t) => ({
        time: new Date(t.executedAt).getTime(),
        side: t.side,
        price: t.price,
      })),
    [trades],
  );

  /**
   * 봇 시작 시 패널에서 바꾼 설정을 먼저 저장한다.
   * 저장 없이 시작하면 화면의 값과 봇이 실제로 쓰는 값이 달라진다.
   */
  async function toggleBot() {
    setPending(true);
    setActionError(null);
    try {
      const starting = bot.status !== 'running';
      if (starting) {
        const saved = await saveBotConfig(bot.id, config);
        if ('error' in saved) return setActionError(saved.error);
      }
      const result = await setBotStatus(bot.id, starting ? 'running' : 'stopped');
      if ('error' in result) setActionError(result.error);
      else router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-canvas">
      <header className="flex items-center gap-5 border-b border-line px-4 py-3">
        <span className="text-sm font-semibold tracking-tight text-brand">FuturesLab</span>

        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="rounded bg-elevated px-2 py-1 text-sm font-semibold outline-none"
        >
          {SYMBOLS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <div className="flex items-baseline gap-2.5">
          <span className={`font-mono text-2xl font-semibold ${up ? 'text-long' : 'text-short'}`}>
            {price ? price.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '—'}
          </span>
          <span className={`font-mono text-sm ${up ? 'text-long' : 'text-short'}`}>
            {up ? '+' : ''}
            {changePct.toFixed(2)}%
          </span>
        </div>

        {/* 테스트넷 자산 — KuCoin Lite의 "USDT자산" 자리 */}
        {account && (
          <div className="hidden items-baseline gap-2 sm:flex">
            <span className="text-[11px] text-faint">테스트넷 자산</span>
            <span className="font-mono text-sm text-ink">
              {account.walletBalance.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} USDT
            </span>
          </div>
        )}

        <span className="ml-auto rounded bg-elevated px-2 py-1 text-[11px] text-muted">테스트넷</span>
        <StatusBadge status={bot.status} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-1 border-b border-line px-4 py-1.5">
            {TIMEFRAMES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTimeframe(t)}
                className={`rounded px-2 py-1 text-xs transition ${
                  timeframe === t ? 'bg-elevated text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                {t}
              </button>
            ))}
            <span className="ml-3 font-mono text-[11px] text-faint">
              <span className="text-[#f0b90b]">━</span> {config.maType} {config.fastPeriod}
              <span className="ml-2 text-[#7b61ff]">━</span> {config.maType} {config.slowPeriod}
            </span>
            {timeframe !== bot.timeframe && (
              <span className="ml-3 text-[11px] text-[#f0b90b]">
                차트만 {timeframe}로 보는 중 — 봇은 {bot.timeframe} 기준으로 판단합니다
              </span>
            )}

            {/* 지표 — 바이낸스 자체 메뉴 기준(19종). 거래소처럼 **여러 개를 동시에** 켠다.
                참고용 시각화이며 봇의 판단에는 쓰이지 않는다 (가드레일 2). */}
            <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-faint">메인</span>
                {MAIN_INDICATORS.map(({ key, meta }) => (
                  <Chip
                    key={key}
                    label={meta.label}
                    title={meta.desc}
                    on={mainIndicators.includes(key)}
                    onClick={() => setMainIndicators(toggle(mainIndicators, key))}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-faint">보조</span>
                {SUB_INDICATORS.map(({ key, meta }) => (
                  <Chip
                    key={key}
                    label={meta.label}
                    title={meta.desc}
                    on={subIndicators.includes(key)}
                    onClick={() => setSubIndicators(toggle(subIndicators, key))}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* 켜둔 지표가 무엇을 계산하는지 — 매매 판단은 말하지 않는다 (가드레일 2·3) */}
          {(mainIndicators.length > 0 || subIndicators.length > 0) && (
            <div className="border-b border-line px-4 py-1">
              <p className="text-[10px] leading-relaxed text-faint">
                {[
                  ...mainIndicators.map((k) => `${mainMeta(k).label}: ${mainMeta(k).desc}`),
                  ...subIndicators.map((k) => `${subMeta(k).label}: ${subMeta(k).desc}`),
                ].join(' · ')}
              </p>
              {subIndicators.length > 3 && (
                <p className="mt-0.5 text-[10px] text-[#f0b90b]">
                  보조지표를 {subIndicators.length}개 켜면 각 패인이 좁아져 읽기 어려워집니다.
                </p>
              )}
            </div>
          )}

          <div className="min-h-[280px] flex-1">
            {loadError ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-short">
                {loadError}
              </div>
            ) : (
              <PriceChart
                candles={candles}
                fastPeriod={config.fastPeriod}
                slowPeriod={config.slowPeriod}
                maType={config.maType}
                trades={markers}
                mainIndicators={mainIndicators}
                subIndicators={subIndicators}
              />
            )}
          </div>

          <div className="h-[290px] shrink-0 border-t border-line">
            <BottomTabs
              positions={livePositions}
              trades={trades}
              events={events}
              connected={connected}
              botError={bot.lastError}
              watch={{
                candles,
                fastPeriod: config.fastPeriod,
                slowPeriod: config.slowPeriod,
                maType: config.maType,
                onDeadCross: config.onDeadCross,
                currentPrice: price,
                stopLossPct: config.stopLossPct,
                takeProfitPct: config.takeProfitPct,
                status: bot.status,
              }}
            />
          </div>
        </div>

        <BotPanel
          config={config}
          onChange={setConfig}
          onSubmit={toggleBot}
          status={bot.status}
          pending={pending}
          error={actionError}
          account={account}
          dirty={JSON.stringify(config) !== JSON.stringify(bot.config)}
        />
      </div>

      <footer className="border-t border-line px-4 py-2">
        <TestnetNotice variant="inline" />
      </footer>
    </div>
  );
}

/** 배열에서 값을 켜고 끈다. 켜는 순서가 곧 패인 순서라 push로 붙인다. */
function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

function Chip({
  label,
  title,
  on,
  onClick,
}: {
  label: string;
  title: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={`rounded px-1.5 py-0.5 text-[11px] transition ${
        on ? 'bg-brand/20 text-brand' : 'text-muted hover:bg-elevated hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    running: ['실행 중', 'bg-long/15 text-long'],
    stopped: ['정지', 'bg-elevated text-muted'],
    error: ['오류', 'bg-short/15 text-short'],
  };
  const [label, cls] = map[status] ?? map.stopped!;
  return <span className={`rounded px-2 py-1 text-[11px] font-medium ${cls}`}>{label}</span>;
}
