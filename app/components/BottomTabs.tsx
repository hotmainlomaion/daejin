'use client';

import { useState } from 'react';
import type { BotEvent, Candle } from '@futureslab/shared';
import { ActivityLog } from '@/components/ActivityLog';
import { BotWatch } from '@/components/BotWatch';

export interface PositionView {
  symbol: string;
  qty: number;
  entryPrice: number;
  unrealizedPnl: number;
  liquidationPrice: number | null;
}

export interface TradeView {
  side: 'BUY' | 'SELL';
  price: number;
  qty: number;
  executedAt: string;
}

/**
 * 하단 탭 — 거래소의 포지션/체결 패널 (KuCoin Lite 참조).
 * 호가창·미체결 주문은 넣지 않는다: 봇이 시장가로만 주문하므로 항상 비어 있다.
 */
export function BottomTabs({
  positions,
  trades,
  events,
  connected,
  botError,
  watch,
}: {
  positions: PositionView[];
  trades: TradeView[];
  events: BotEvent[];
  connected: boolean;
  botError?: string | null;
  /** "봇의 눈" 탭에 필요한 값들 */
  watch: {
    botId: string;
    candles: Candle[];
    fastPeriod: number;
    slowPeriod: number;
    maType: 'SMA' | 'EMA';
    onDeadCross: 'SHORT' | 'CLOSE_ONLY';
    currentPrice: number | null;
    stopLossPct: number;
    takeProfitPct: number;
    status: 'stopped' | 'running' | 'error';
  };
}) {
  // 기본 탭이 "봇의 눈"인 이유: 선물을 모르는 유저에게는 로그 목록보다
  // "지금 뭘 기다리는 중인지"가 먼저 보여야 한다.
  const [tab, setTab] = useState<'watch' | 'activity' | 'positions' | 'trades'>('watch');

  return (
    <section className="flex h-full flex-col bg-panel">
      <div className="flex items-center gap-4 border-b border-line px-4">
        {(
          [
            ['watch', '봇의 눈'],
            ['activity', '활동 기록'],
            ['positions', `포지션 (${positions.length})`],
            ['trades', `체결 내역 (${trades.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 border-b-2 px-1 py-2.5 text-xs font-medium transition ${
              tab === key
                ? 'border-brand text-ink'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {label}
            {/* 실시간 연결 표시 — 봇이 뭔가 하면 화면이 즉시 반응한다는 신호 */}
            {key === 'watch' && (
              <span
                className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-long' : 'bg-faint'}`}
                title={connected ? '실시간 연결됨' : '연결 대기'}
              />
            )}
          </button>
        ))}
      </div>

      {botError && (
        <p className="border-b border-short/30 bg-short/10 px-4 py-2 text-xs text-short">
          {botError}
        </p>
      )}

      <div className="flex-1 overflow-auto">
        {tab === 'watch' ? (
          <BotWatch
            candles={watch.candles}
            fastPeriod={watch.fastPeriod}
            slowPeriod={watch.slowPeriod}
            maType={watch.maType}
            onDeadCross={watch.onDeadCross}
            position={positions[0] ?? null}
            currentPrice={watch.currentPrice}
            stopLossPct={watch.stopLossPct}
            takeProfitPct={watch.takeProfitPct}
            status={watch.status}
          />
        ) : tab === 'activity' ? (
          <ActivityLog events={events} botId={watch.botId} />
        ) : tab === 'positions' ? (
          positions.length === 0 ? (
            <Empty text="보유 중인 포지션이 없습니다. 봇이 진입 조건을 기다리는 중입니다." />
          ) : (
            <Table
              head={['심볼', '방향', '수량', '진입가', '미실현 손익', '청산가']}
              rows={positions.map((p) => [
                p.symbol,
                <span key="s" className={p.qty > 0 ? 'text-long' : 'text-short'}>
                  {p.qty > 0 ? '롱' : '숏'}
                </span>,
                Math.abs(p.qty).toString(),
                fmt(p.entryPrice),
                <span key="p" className={p.unrealizedPnl >= 0 ? 'text-long' : 'text-short'}>
                  {signed(p.unrealizedPnl)}
                </span>,
                p.liquidationPrice ? fmt(p.liquidationPrice) : '—',
              ])}
            />
          )
        ) : trades.length === 0 ? (
          <Empty text="아직 체결된 주문이 없습니다." />
        ) : (
          <Table
            head={['시각', '방향', '가격', '수량']}
            rows={trades.map((t) => [
              new Date(t.executedAt).toLocaleString('ko-KR'),
              <span key="s" className={t.side === 'BUY' ? 'text-long' : 'text-short'}>
                {t.side === 'BUY' ? '매수' : '매도'}
              </span>,
              fmt(t.price),
              t.qty.toString(),
            ])}
          />
        )}
      </div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-10 text-center text-xs text-faint">{text}</p>;
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <table className="w-full text-left text-xs">
      <thead className="sticky top-0 bg-panel">
        <tr className="text-faint">
          {head.map((h) => (
            <th key={h} className="px-4 py-2 font-normal">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="font-mono">
        {rows.map((row, i) => (
          <tr key={i} className="border-t border-line/50">
            {row.map((cell, j) => (
              <td key={j} className="px-4 py-2">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const fmt = (v: number) => v.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
const signed = (v: number) =>
  `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('ko-KR', { maximumFractionDigits: 2 })} USDT`;
