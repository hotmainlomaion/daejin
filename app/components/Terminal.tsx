'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Candle } from '@futureslab/shared';
import { saveBotConfig, setBotStatus } from '@/app/actions';
import { BotPanel, type BotConfig } from '@/components/BotPanel';
import { BottomTabs, type PositionView, type TradeView } from '@/components/BottomTabs';
import { PriceChart, type TradeMarker } from '@/components/PriceChart';
import { TestnetNotice } from '@/components/TestnetNotice';

export interface TerminalBot {
  id: string;
  name: string;
  symbol: string;
  timeframe: string;
  status: 'stopped' | 'running' | 'error';
  lastError: string | null;
  config: BotConfig;
}

const SYMBOLS = ['BTCUSDT', 'ETHUSDT'];
const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h'];

/**
 * 트레이딩 터미널 화면 (CLAUDE.md §디자인 톤 — KuCoin Futures Lite 기준).
 *
 * 레이아웃: 상단 가격 헤더 · 좌측 차트 · 우측 봇 설정 패널 · 하단 포지션/체결 탭.
 * 거래소와 다른 점은 우측 패널이 "주문"이 아니라 "봇 설정"이라는 것.
 */
export function Terminal({
  bot,
  positions,
  trades,
}: {
  bot: TerminalBot;
  positions: PositionView[];
  trades: TradeView[];
}) {
  const router = useRouter();
  const [symbol, setSymbol] = useState(bot.symbol);
  const [timeframe, setTimeframe] = useState(bot.timeframe);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [config, setConfig] = useState<BotConfig>(bot.config);
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadCandles = useCallback(async () => {
    try {
      const res = await fetch(`/api/klines?symbol=${symbol}&interval=${timeframe}&limit=200`);
      const json = await res.json();
      if (!res.ok) {
        setLoadError(json.error ?? '시세를 불러오지 못했습니다.');
        return;
      }
      setCandles(json.candles);
      setLoadError(null);
    } catch {
      setLoadError('시세 서버에 연결할 수 없습니다.');
    }
  }, [symbol, timeframe]);

  useEffect(() => {
    void loadCandles();
    // 캔들 종가마다 평가하는 제품이므로 초 단위 갱신은 불필요하다. 15초 폴링으로 충분.
    const timer = setInterval(() => void loadCandles(), 15_000);
    return () => clearInterval(timer);
  }, [loadCandles]);

  const last = candles[candles.length - 1];
  const first = candles[0];
  const changePct = last && first ? ((last.close - first.open) / first.open) * 100 : 0;
  const up = changePct >= 0;

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
        if ('error' in saved) {
          setActionError(saved.error);
          return;
        }
      }
      const result = await setBotStatus(bot.id, starting ? 'running' : 'stopped');
      if ('error' in result) setActionError(result.error);
      else router.refresh();
    } finally {
      setPending(false);
    }
  }

  const markers: TradeMarker[] = trades.map((t) => ({
    time: new Date(t.executedAt).getTime(),
    side: t.side,
    price: t.price,
  }));

  return (
    <div className="flex h-screen flex-col bg-canvas">
      {/* 헤더 */}
      <header className="flex items-center gap-6 border-b border-line px-4 py-3">
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

        <div className="flex items-baseline gap-3">
          <span className={`font-mono text-2xl font-semibold ${up ? 'text-long' : 'text-short'}`}>
            {last ? last.close.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '—'}
          </span>
          <span className={`font-mono text-sm ${up ? 'text-long' : 'text-short'}`}>
            {up ? '+' : ''}
            {changePct.toFixed(2)}%
          </span>
        </div>

        <span className="ml-auto rounded bg-elevated px-2 py-1 text-[11px] text-muted">
          테스트넷
        </span>
        <StatusBadge status={bot.status} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 flex-1 flex-col">
          {/* 캔들 주기 */}
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
          </div>

          {/* 차트 */}
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
              />
            )}
          </div>

          {/* 하단 탭 */}
          <div className="h-[220px] shrink-0 border-t border-line">
            <BottomTabs positions={positions} trades={trades} botError={bot.lastError} />
          </div>
        </div>

        {/* 우측 봇 패널 */}
        <BotPanel
          config={config}
          onChange={setConfig}
          onSubmit={toggleBot}
          status={bot.status}
          pending={pending}
          error={actionError}
          dirty={JSON.stringify(config) !== JSON.stringify(bot.config)}
        />
      </div>

      {/* 테스트넷 한계 고지 — 숨기지 않는다 (CLAUDE.md) */}
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
