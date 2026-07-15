import type { CommonParams, Position, Signal } from './types.ts';

/**
 * 손절/익절 체크.
 *
 * strategy-templates.md §구현 노트: "손절/익절은 전략 시그널과 별개로 포지션 보유 중
 * **매 평가마다** 우선 체크 (전략 신호보다 리스크 관리가 먼저)."
 * 따라서 각 전략의 evaluate()는 자기 로직보다 이 함수를 먼저 부른다.
 *
 * 손절/익절 퍼센트는 **레버리지 미반영 가격 변동률** 기준이다.
 * (레버리지 5x에 stopLossPct=2면 가격 2% 역행 시 손절 = 증거금 기준 10% 손실)
 *
 * @returns 청산해야 하면 CLOSE 시그널, 아니면 null
 */
export function checkStopLossTakeProfit(
  currentPrice: number,
  position: Position | null,
  params: Pick<CommonParams, 'stopLossPct' | 'takeProfitPct'>,
): Signal | null {
  if (position === null) return null;
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;
  if (position.entryPrice <= 0) return null;

  // 진입가 대비 손익률(%). SHORT는 부호가 뒤집힌다.
  const rawChangePct = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
  const pnlPct = position.side === 'LONG' ? rawChangePct : -rawChangePct;

  // 같은 캔들에서 손절·익절이 동시에 걸릴 수 있다. 종가 기준으로는 둘 중
  // 어느 쪽이 먼저 닿았는지 알 수 없으므로 보수적으로 손절을 우선한다.
  if (params.stopLossPct > 0 && pnlPct <= -params.stopLossPct) {
    return {
      action: 'CLOSE',
      reason: `손절 도달 (${pnlPct.toFixed(2)}% ≤ -${params.stopLossPct}%)`,
    };
  }

  if (params.takeProfitPct > 0 && pnlPct >= params.takeProfitPct) {
    return {
      action: 'CLOSE',
      reason: `익절 도달 (${pnlPct.toFixed(2)}% ≥ ${params.takeProfitPct}%)`,
    };
  }

  return null;
}
