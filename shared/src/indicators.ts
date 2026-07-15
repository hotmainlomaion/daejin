/**
 * 지표 계산. 돈 로직이므로 전부 순수 함수로 두고 단위 테스트로 고정한다
 * (CLAUDE.md 코딩 컨벤션).
 */

/**
 * 단순 이동평균. 마지막 `period`개의 산술 평균.
 * 데이터가 부족하면 null.
 */
export function sma(values: readonly number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) {
    sum += values[i]!;
  }
  return sum / period;
}

/**
 * 지수 이동평균.
 * 시드는 처음 `period`개의 SMA, 이후 계수 2/(period+1)로 순차 갱신한다.
 * 데이터가 부족하면 null.
 */
export function ema(values: readonly number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;

  const seed = sma(values.slice(0, period), period);
  if (seed === null) return null;

  const k = 2 / (period + 1);
  let acc = seed;
  for (let i = period; i < values.length; i++) {
    acc = values[i]! * k + acc * (1 - k);
  }
  return acc;
}

/** maType에 따라 SMA/EMA를 고른다. */
export function movingAverage(
  values: readonly number[],
  period: number,
  maType: 'SMA' | 'EMA',
): number | null {
  return maType === 'SMA' ? sma(values, period) : ema(values, period);
}
