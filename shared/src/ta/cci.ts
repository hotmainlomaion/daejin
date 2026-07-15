/**
 * CCI (바이낸스 서브 지표).
 *
 *   전형가(TP) = (high + low + close) / 3
 *   CCI = (TP - SMA(TP, period)) / (0.015 × 평균절대편차)
 *
 * 차트 표시용 참고 자료다 — 봇의 판단에는 쓰이지 않는다 (CLAUDE.md 가드레일 2).
 */

import { sma } from './moving-averages.ts';
import type { Candle } from '../types.ts';

/** 바이낸스 차트 기본값. */
export const CCI_PERIOD = 20;

/**
 * Lambert 상수. CCI 값의 약 70~80%가 -100~+100에 들어오도록 스케일을 맞추는 값으로,
 * 수학적 필연이 아니라 관례다. 바꾸면 화면 눈금의 의미가 달라진다.
 */
export const CCI_CONSTANT = 0.015;

/** 전형가 (typical price). */
function typicalPrice(candle: Candle): number {
  return (candle.high + candle.low + candle.close) / 3;
}

/**
 * 각 시점의 CCI를 배열로. 차트 보조지표 패인용.
 *
 * ⚠️ 분모는 **평균절대편차(mean absolute deviation)**이지 표준편차가 아니다.
 *    Σ|TP_i - SMA| / period 이며, 제곱·제곱근이 들어가지 않는다. 표준편차로 잘못
 *    구현해도 값이 그럴듯하게 나오는 탓에 눈으로는 못 잡는다 (테스트로 고정해 뒀다).
 *
 * 윈도는 [i-period+1, i]라 첫 값은 인덱스 period-1에서 나온다. 미래 캔들은 보지 않는다.
 * SMA는 `moving-averages.ts`의 것을 그대로 쓴다.
 * 길이는 항상 입력과 같고, period가 0 이하면 전 구간 null.
 */
export function cciSeries(candles: readonly Candle[], period: number = CCI_PERIOD): (number | null)[] {
  const out: (number | null)[] = new Array<number | null>(candles.length).fill(null);
  if (period <= 0) return out;

  const tp = candles.map(typicalPrice);

  for (let i = period - 1; i < candles.length; i++) {
    const window = tp.slice(i - period + 1, i + 1);
    const mean = sma(window, period);
    if (mean === null) continue;

    // 평균절대편차: 편차의 절댓값 평균 (표준편차 아님)
    let absDeviationSum = 0;
    for (const v of window) {
      absDeviationSum += Math.abs(v - mean);
    }
    const meanAbsDeviation = absDeviationSum / period;

    if (meanAbsDeviation === 0) {
      // 0으로 나누기: 구간의 TP가 전부 같아 편차가 없는 경우.
      // 이때 분자(TP - SMA)도 반드시 0이라 0/0으로 정의되지 않는다.
      // CCI는 0을 기준선으로 위아래로 진동하는 지표이고 0이 곧 중립이므로,
      // "평균에서 전혀 벗어나지 않았다"는 상태를 그대로 나타내는 0을 쓴다.
      // (rsi.ts가 무변동 구간을 중립 50으로 두는 것과 같은 판단이다.)
      out[i] = 0;
      continue;
    }

    out[i] = (tp[i]! - mean) / (CCI_CONSTANT * meanAbsDeviation);
  }
  return out;
}
