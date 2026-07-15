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
  const [subIndicator, setSubIndicator] = useState<SubIndicator>('volume');
  const [mainIndicator, setMainIndicator] = useState<MainIndicator>('none');

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

            {/* 지표 — 바이낸스 자체 메뉴 기준(19종).
                참고용 시각화이며 봇의 판단에는 쓰이지 않는다 (가드레일 2). */}
            <div className="ml-auto flex items-center gap-2">
              <label className="flex items-center gap-1">
                <span className="text-[10px] text-faint">메인</span>
                <select
                  value={mainIndicator}
                  onChange={(e) => setMainIndicator(e.target.value as MainIndicator)}
                  className="rounded bg-elevated px-1.5 py-1 text-xs outline-none"
                  title={mainMeta(mainIndicator).desc}
                >
                  {MAIN_INDICATORS.map(({ key, meta }) => (
                    <option key={key} value={key}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1">
                <span className="text-[10px] text-faint">보조</span>
                <select
                  value={subIndicator}
                  onChange={(e) => setSubIndicator(e.target.value as SubIndicator)}
                  className="rounded bg-elevated px-1.5 py-1 text-xs outline-none"
                  title={subMeta(subIndicator).desc}
                >
                  {SUB_INDICATORS.map(({ key, meta }) => (
                    <option key={key} value={key}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* 선택한 지표가 무엇을 계산하는지 — 매매 판단은 말하지 않는다 (가드레일 2·3) */}
          {(mainIndicator !== 'none' || subIndicator !== 'none') && (
            <p className="border-b border-line px-4 py-1 text-[10px] leading-relaxed text-faint">
              {mainIndicator !== 'none' && <>{mainMeta(mainIndicator).label}: {mainMeta(mainIndicator).desc}</>}
              {mainIndicator !== 'none' && subIndicator !== 'none' && ' · '}
              {subIndicator !== 'none' && <>{subMeta(subIndicator).label}: {subMeta(subIndicator).desc}</>}
            </p>
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
                mainIndicator={mainIndicator}
                subIndicator={subIndicator}
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    running: ['실행 중', 'bg-long/15 text-long'],
    stopped: ['정지', 'bg-elevated text-muted'],
    error: ['오류', 'bg-short/15 text-short'],
  };
  const [label, cls] = map[status] ?? map.stopped!;
  return <span className={`rounded px-2 py-1 text-[11px] font-medium ${cls}`}>{label}</span>;
}
