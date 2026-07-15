/**
 * BOLL — 볼린저 밴드 (바이낸스 메인 지표).
 *
 * 중심선은 SMA, 상/하단은 중심선 ± (표준편차 × 배수).
 * 돈 로직이므로 순수 함수 + 단위 테스트로 고정한다 (CLAUDE.md 코딩 컨벤션).
 */

import { sma } from './moving-averages.ts';

/** 바이낸스·TradingView 기본값. 유저가 바꾸기 전까지 이 값으로 그린다. */
export const BOLLINGER_DEFAULT_PERIOD = 20;
export const BOLLINGER_DEFAULT_STDDEV_MULT = 2;

/** 한 시점의 볼린저 밴드 (계산이 성립한 경우). */
export interface BollingerBandsValue {
  upper: number;
  middle: number;
  lower: number;
}

/**
 * 시리즈의 한 원소. 데이터가 부족한 앞 구간은 세 필드가 전부 null이 되어
 * 차트에서 선이 시작되지 않는다.
 */
export interface BollingerBandsPoint {
  upper: number | null;
  middle: number | null;
  lower: number | null;
}

/**
 * 마지막 `period`개의 모집단 표준편차.
 *
 * ⚠️ 모집단(n으로 나눔)이다. 표본(n-1로 나눔)이 아니다.
 * 근거: 볼린저 밴드의 이동창(window)은 "모집단에서 뽑은 표본"이 아니라
 * 그 자체가 관심 대상인 구간 전체다. Bollinger 본인의 정의도, TradingView·
 * 바이낸스의 구현도 n으로 나눈다. n-1을 쓰면 밴드가 미세하게 넓어져서
 * 유저가 거래소 화면과 우리 차트를 겹쳐 봤을 때 값이 어긋난다 (rsi.ts에서
 * Wilder 평활을 고집한 것과 같은 이유).
 *
 * 호출부에서 이미 길이를 검사하므로 여기서는 검사하지 않는다.
 */
function populationStdDev(values: readonly number[], period: number, mean: number): number {
  let sumSqDiff = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const diff = values[i]! - mean;
    sumSqDiff += diff * diff;
  }
  return Math.sqrt(sumSqDiff / period);
}

/**
 * 마지막 시점의 볼린저 밴드. 데이터가 부족하거나 period <= 0이면 null.
 *
 * 변동성이 0인 구간(전부 같은 값)에서는 표준편차가 0이라 세 선이 정확히 겹친다.
 * 예외로 두지 않고 그대로 내보낸다 — 횡보 구간에서 밴드가 붙는 것은 볼린저 밴드가
 * 의도한 표현(스퀴즈)이지 오류가 아니다.
 */
export function bollingerBands(
  values: readonly number[],
  period: number = BOLLINGER_DEFAULT_PERIOD,
  stdDevMult: number = BOLLINGER_DEFAULT_STDDEV_MULT,
): BollingerBandsValue | null {
  if (period <= 0 || values.length < period) return null;

  const middle = sma(values, period);
  if (middle === null) return null;

  const sd = populationStdDev(values, period, middle);
  const offset = sd * stdDevMult;
  return { upper: middle + offset, middle, lower: middle - offset };
}

/**
 * 각 시점의 볼린저 밴드를 배열로. 차트 오버레이용.
 *
 * ⚠️ maSeries와 같은 이유로 `bollingerBands()`를 그대로 호출한다 — 차트 선과
 * 단일 함수 값이 어긋나면 안 되므로 계산을 두 벌 두지 않는다.
 */
export function bollingerSeries(
  values: readonly number[],
  period: number = BOLLINGER_DEFAULT_PERIOD,
  stdDevMult: number = BOLLINGER_DEFAULT_STDDEV_MULT,
): BollingerBandsPoint[] {
  return values.map((_, i) => {
    const band = bollingerBands(values.slice(0, i + 1), period, stdDevMult);
    return band ?? { upper: null, middle: null, lower: null };
  });
}
