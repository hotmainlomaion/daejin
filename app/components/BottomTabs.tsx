'use client';

import { useState } from 'react';

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
  botError,
}: {
  positions: PositionView[];
  trades: TradeView[];
  botError?: string | null;
}) {
  const [tab, setTab] = useState<'positions' | 'trades'>('positions');

  return (
    <section className="flex h-full flex-col bg-panel">
      <div className="flex items-center gap-4 border-b border-line px-4">
        {(
          [
            ['positions', `포지션 (${positions.length})`],
            ['trades', `체결 내역 (${trades.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`border-b-2 px-1 py-2.5 text-xs font-medium transition ${
              tab === key
                ? 'border-brand text-ink'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {botError && (
        <p className="border-b border-short/30 bg-short/10 px-4 py-2 text-xs text-short">
          {botError}
        </p>
      )}

      <div className="flex-1 overflow-auto">
        {tab === 'positions' ? (
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
