'use client';

import type { PositionView } from '@/components/BottomTabs';

/**
 * 가격 사다리 — 선물을 모르는 사람에게 가장 중요한 화면.
 *
 * PRD 타겟은 "차트 용어는 알지만 코딩은 못 하는 준전문 트레이더"이고, 심리적 핵심은
 * "안전하게 먼저 돌려보고 싶다"다. 그런데 숫자만 나열하면 **청산가가 지금 가격에서
 * 얼마나 가까운지**가 전혀 체감되지 않는다. 레버리지를 20x로 올렸을 때 청산선이
 * 코앞까지 다가오는 걸 눈으로 봐야 레버리지가 뭔지 이해된다.
 *
 * 그래서 진입가·현재가·손절·익절·청산가를 **하나의 가격 축**에 얹는다.
 *
 * ⚠️ 가드레일 3: 수익·기대수익률을 말하지 않는다. 위치와 거리만 보여준다.
 */
export function PriceLadder({
  position,
  currentPrice,
  stopLossPct,
  takeProfitPct,
}: {
  position: PositionView;
  currentPrice: number;
  stopLossPct: number;
  takeProfitPct: number;
}) {
  const isLong = position.qty > 0;
  const entry = position.entryPrice;

  // 손절·익절은 진입가 대비 가격 변동률 기준 (레버리지 미반영) — risk.ts와 같은 정의
  const stop = stopLossPct > 0 ? entry * (1 + (isLong ? -stopLossPct : stopLossPct) / 100) : null;
  const take = takeProfitPct > 0 ? entry * (1 + (isLong ? takeProfitPct : -takeProfitPct) / 100) : null;
  const liq = position.liquidationPrice;

  // 축의 범위: 표시할 모든 선을 담되, 청산가가 너무 멀면 축이 뭉개지므로
  // 현재가 기준 ±15%로 자른다. 잘렸다는 사실은 별도로 알린다.
  const MAX_SPAN = 0.15;
  const lo = currentPrice * (1 - MAX_SPAN);
  const hi = currentPrice * (1 + MAX_SPAN);
  const clamped = (v: number) => Math.min(Math.max(v, lo), hi);
  const pos = (v: number) => ((clamped(v) - lo) / (hi - lo)) * 100;

  const liqOutOfRange = liq !== null && (liq < lo || liq > hi);

  // 청산까지 남은 거리 — 이 숫자가 이 컴포넌트의 존재 이유다
  const liqDistPct = liq !== null ? Math.abs((currentPrice - liq) / currentPrice) * 100 : null;
  const liqDanger = liqDistPct !== null && liqDistPct < 5;

  const rows: { key: string; value: number; label: string; color: string; note: string }[] = [];
  if (take !== null) {
    rows.push({
      key: 'take',
      value: take,
      label: '익절',
      color: 'bg-long',
      note: '여기 닿으면 봇이 포지션을 정리합니다',
    });
  }
  rows.push({
    key: 'entry',
    value: entry,
    label: '진입가',
    color: 'bg-muted',
    note: '봇이 들어간 가격',
  });
  if (stop !== null) {
    rows.push({
      key: 'stop',
      value: stop,
      label: '손절',
      color: 'bg-short',
      note: '여기 닿으면 손실을 확정하고 나옵니다',
    });
  }
  if (liq !== null) {
    rows.push({
      key: 'liq',
      value: liq,
      label: '청산',
      color: 'bg-[#f0b90b]',
      note: '여기 닿으면 증거금을 모두 잃고 강제 종료됩니다',
    });
  }
  rows.sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-3 rounded border border-line bg-canvas p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-ink">
          가격 위치 · <span className={isLong ? 'text-long' : 'text-short'}>{isLong ? '롱' : '숏'}</span>
        </span>
        {liqDistPct !== null && (
          <span className={`font-mono text-[11px] ${liqDanger ? 'text-[#f0b90b]' : 'text-faint'}`}>
            청산까지 {liqDistPct.toFixed(1)}%
          </span>
        )}
      </div>

      {/* 가격 축 */}
      <div className="relative h-[132px] rounded bg-panel">
        {rows.map((r) => {
          const outOfRange = r.value < lo || r.value > hi;
          return (
            <div
              key={r.key}
              className="absolute left-0 right-0 flex items-center gap-2 px-2"
              style={{ bottom: `calc(${pos(r.value)}% - 8px)` }}
            >
              <span className={`h-0.5 w-3 shrink-0 rounded ${r.color}`} />
              <span className="shrink-0 text-[10px] text-muted">{r.label}</span>
              <span className="font-mono text-[10px] text-faint">
                {r.value.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}
                {outOfRange && ' ↓'}
              </span>
            </div>
          );
        })}

        {/* 현재가 — 항상 축 한가운데 */}
        <div
          className="absolute left-0 right-0 flex items-center gap-2 px-2"
          style={{ bottom: `calc(${pos(currentPrice)}% - 8px)` }}
        >
          <span className="h-[2px] w-3 shrink-0 rounded bg-ink" />
          <span className="shrink-0 rounded bg-ink px-1 text-[10px] font-semibold text-canvas">
            현재
          </span>
          <span className="font-mono text-[10px] text-ink">
            {currentPrice.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}
          </span>
        </div>
      </div>

      {/* 쉬운 말 설명 — 선물을 모르는 사람 기준 */}
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.key} className="flex items-start gap-1.5 text-[10px] leading-relaxed">
            <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${r.color}`} />
            <span className="text-faint">
              <span className="text-muted">{r.label}</span> — {r.note}
            </span>
          </li>
        ))}
      </ul>

      {liqOutOfRange && (
        <p className="text-[10px] leading-relaxed text-faint">
          청산가가 현재가에서 15% 넘게 떨어져 있어 축 밖에 있습니다 (↓ 표시). 레버리지가 낮을수록
          청산가는 멀어집니다.
        </p>
      )}
      {liqDanger && (
        <p className="rounded bg-[#f0b90b]/10 px-2 py-1.5 text-[10px] leading-relaxed text-[#f0b90b]">
          청산가가 현재가에서 {liqDistPct!.toFixed(1)}%밖에 떨어져 있지 않습니다. 이 정도 가격
          변동은 흔합니다.
        </p>
      )}
    </div>
  );
}
