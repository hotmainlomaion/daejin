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

/**
 * 각 시점의 이동평균을 배열로. 차트 오버레이용.
 *
 * ⚠️ 전략이 쓰는 `movingAverage()`를 그대로 호출한다 — 차트에 그려지는 선과
 * 봇이 판단에 쓰는 값이 반드시 같아야 하므로 계산을 따로 구현하지 않는다.
 * 데이터가 부족한 앞 구간은 null (차트에서 선이 시작되지 않는다).
 */
export function maSeries(
  values: readonly number[],
  period: number,
  maType: 'SMA' | 'EMA',
): (number | null)[] {
  return values.map((_, i) => movingAverage(values.slice(0, i + 1), period, maType));
}

/**
 * avgGain/avgLoss 한 쌍을 RSI 값으로 변환한다.
 *
 * 0으로 나누기가 나는 두 경우를 여기서 한 번에 막는다:
 * - avgLoss === 0 && avgGain === 0 → 50.
 *   가격이 전혀 움직이지 않은 구간. RS = 0/0 이라 수학적으로 정의되지 않으므로
 *   "과매수도 과매도도 아닌 중립"이라는 관례값 50을 쓴다. 0이나 100으로 두면
 *   횡보장에서 RSI 전략이 가짜 시그널을 내므로 이 선택이 돈 로직 관점에서도 안전하다.
 * - avgLoss === 0 (avgGain > 0) → 100.
 *   전 구간 상승이라 RS가 무한대로 발산한다. RSI = 100 - 100/(1+∞) = 100 이 극한값이므로
 *   TradingView·바이낸스와 동일하게 100으로 고정한다.
 *   (JS는 x/0 = Infinity라 식을 그대로 태워도 100이 나오지만, 의도를 코드로 남긴다.)
 *
 * avgGain === 0 (전 구간 하락)은 RS = 0 이 되어 식이 그대로 0을 내므로 분기하지 않는다.
 */
function toRsi(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * 각 시점의 RSI를 배열로. 차트 보조지표 패인용.
 *
 * Wilder 평활법을 쓴다 (단순 평균이 아니다) — TradingView·바이낸스가 보여주는 값과
 * 어긋나면 유저가 화면을 믿지 못하기 때문.
 * - 시드: 처음 `period`개 변화량의 단순 평균
 * - 이후: avg = (이전 avg * (period-1) + 현재 값) / period
 *
 * RSI는 순차 누적이라 한 번의 순회로 O(n)에 낼 수 있으므로 maSeries처럼
 * 시점마다 다시 계산하지 않는다. 길이는 항상 입력과 같고, 변화량이 `period`개
 * 모이지 않는 앞 구간(인덱스 < period)은 null이다.
 */
export function rsiSeries(values: readonly number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array<number | null>(values.length).fill(null);
  // 변화량은 캔들 수보다 하나 적으므로 period개 변화량을 모으려면 period+1개가 필요하다.
  if (period <= 0 || values.length < period + 1) return out;

  // 시드: 처음 period개 변화량의 단순 평균
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i]! - values[i - 1]!;
    if (diff > 0) avgGain += diff;
    else avgLoss += -diff;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = toRsi(avgGain, avgLoss);

  // 이후 구간은 Wilder 평활로 순차 갱신
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i]! - values[i - 1]!;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = toRsi(avgGain, avgLoss);
  }
  return out;
}

/**
 * 마지막 시점의 RSI. 데이터가 부족하면(캔들 수 < period + 1) null.
 *
 * ⚠️ 계산을 따로 구현하지 않고 `rsiSeries()`의 마지막 값을 그대로 쓴다 — maSeries와
 * 방향은 반대지만 이유는 같다. 차트에 그려지는 선과 봇이 판단에 쓰는 값이 부동소수점
 * 오차까지 동일해야 하므로, 두 벌의 누적 루프를 두지 않는다.
 * (rsiSeries가 O(n)이라 마지막 값만 필요해도 비용이 같다.)
 */
export function rsi(values: readonly number[], period: number): number | null {
  const series = rsiSeries(values, period);
  return series[series.length - 1] ?? null;
}
