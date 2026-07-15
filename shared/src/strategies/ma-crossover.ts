import { movingAverage } from '../indicators.ts';
import { checkStopLossTakeProfit } from '../risk.ts';
import type { Candle, Evaluate, MaCrossoverParams, Signal } from '../types.ts';

const HOLD = (reason: string): Signal => ({ action: 'HOLD', reason });

/**
 * 파라미터 유효성 검사 (strategy-templates.md §2 엣지케이스).
 * UI에서도 막지만, 워커가 DB에서 읽은 값을 그대로 믿지 않도록 여기서도 확인한다.
 *
 * @returns 문제가 있으면 한국어 사유, 없으면 null
 */
export function validateMaCrossoverParams(params: MaCrossoverParams): string | null {
  if (!Number.isInteger(params.fastPeriod) || params.fastPeriod < 1) {
    return '단기 MA 기간은 1 이상의 정수여야 합니다.';
  }
  if (!Number.isInteger(params.slowPeriod) || params.slowPeriod < 1) {
    return '장기 MA 기간은 1 이상의 정수여야 합니다.';
  }
  if (params.fastPeriod >= params.slowPeriod) {
    return '단기 MA 기간은 장기 MA 기간보다 작아야 합니다.';
  }
  return null;
}

/**
 * 이평선 교차 (strategy-templates.md §2).
 *
 * - 골든크로스(단기가 장기를 상향 교차) → LONG
 * - 데드크로스(단기가 장기를 하향 교차) → onDeadCross 설정에 따라 SHORT 또는 CLOSE
 * - 손절/익절이 걸리면 교차 여부와 무관하게 그쪽이 우선
 *
 * 교차 판정은 **직전 캔들과 현재 캔들의 MA 대소 관계가 뒤집혔는지**로 한다.
 * 따라서 slowPeriod + 1개의 캔들이 필요하다.
 */
export const evaluateMaCrossover: Evaluate<MaCrossoverParams> = (candles, params, position) => {
  const invalid = validateMaCrossoverParams(params);
  if (invalid !== null) return HOLD(invalid);

  // 교차를 보려면 직전 시점 MA도 필요하므로 캔들이 slowPeriod + 1개 이상이어야 한다.
  if (candles.length < params.slowPeriod + 1) {
    return HOLD(`캔들 부족 (${candles.length}/${params.slowPeriod + 1})`);
  }

  const lastCandle = candles[candles.length - 1]!;

  // 리스크 관리가 전략 신호보다 먼저다.
  const risk = checkStopLossTakeProfit(lastCandle.close, position, params);
  if (risk !== null) return risk;

  const closes = candles.map((c: Candle) => c.close);
  const prevCloses = closes.slice(0, -1);

  const fastNow = movingAverage(closes, params.fastPeriod, params.maType);
  const slowNow = movingAverage(closes, params.slowPeriod, params.maType);
  const fastPrev = movingAverage(prevCloses, params.fastPeriod, params.maType);
  const slowPrev = movingAverage(prevCloses, params.slowPeriod, params.maType);

  if (fastNow === null || slowNow === null || fastPrev === null || slowPrev === null) {
    return HOLD('MA 계산 불가 (캔들 부족)');
  }

  const wasAbove = fastPrev > slowPrev;
  const isAbove = fastNow > slowNow;

  // 교차 없음 — 대소 관계가 그대로면 아무 일도 하지 않는다.
  if (wasAbove === isAbove) {
    return HOLD('교차 없음');
  }

  const goldenCross = !wasAbove && isAbove;

  if (goldenCross) {
    // 이미 롱이면 중복 진입하지 않는다.
    if (position?.side === 'LONG') return HOLD('이미 롱 보유 중');
    // 숏 보유 중 골든크로스 → 먼저 청산. 재진입은 다음 평가에서 판단한다
    // (한 번의 평가에서 청산+진입을 동시에 내보내지 않는다 — 워커 로직 단순화).
    if (position?.side === 'SHORT') return { action: 'CLOSE', reason: '골든크로스 — 숏 청산' };
    return { action: 'LONG', reason: '골든크로스 — 단기 MA가 장기 MA 상향 교차' };
  }

  // 데드크로스
  if (position?.side === 'LONG') {
    return { action: 'CLOSE', reason: '데드크로스 — 롱 청산' };
  }
  if (params.onDeadCross === 'CLOSE_ONLY') {
    return HOLD('데드크로스 — 청산 전용 설정, 신규 진입 안 함');
  }
  if (position?.side === 'SHORT') return HOLD('이미 숏 보유 중');

  return { action: 'SHORT', reason: '데드크로스 — 단기 MA가 장기 MA 하향 교차' };
};
