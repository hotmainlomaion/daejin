/**
 * MACD (바이낸스 서브 지표).
 *
 * MACD선  = EMA(fast) - EMA(slow)
 * 시그널선 = MACD선의 EMA(signal)
 * 히스토그램 = MACD선 - 시그널선
 *
 * 차트 표시용 참고 자료다 — 봇의 판단에는 쓰이지 않는다 (CLAUDE.md 가드레일 2).
 * EMA는 `moving-averages.ts`의 것을 그대로 쓴다. 계산을 다시 구현하면 차트의 이평선과
 * MACD가 미묘하게 어긋나므로, 같은 함수를 재사용하는 것이 이 파일의 원칙이다.
 */

import { maSeries } from './moving-averages.ts';

/** 바이낸스 차트 기본값 12/26/9. */
export const MACD_FAST_PERIOD = 12;
export const MACD_SLOW_PERIOD = 26;
export const MACD_SIGNAL_PERIOD = 9;

/** 한 시점의 MACD 삼종 세트. 데이터가 부족한 앞 구간은 각 필드가 null이다. */
export interface MacdPoint {
  /** MACD선 (EMA(fast) - EMA(slow)) */
  macd: number | null;
  /** 시그널선 (MACD선의 EMA(signal)) */
  signal: number | null;
  /** 히스토그램 (MACD선 - 시그널선) */
  histogram: number | null;
}

/**
 * 앞 구간이 null인 시리즈에 EMA를 적용하고, 결과를 원래 인덱스에 되돌려 붙인다.
 *
 * ⚠️ 이 함수가 MACD 구현의 핵심 판단이다.
 * 시그널선은 "MACD선 **값들**의 EMA"이지 "가격의 EMA"가 아니다. MACD선은 EMA(slow)가
 * 만들어지기 전(인덱스 < slowPeriod-1)에는 값이 없으므로, 그 null 구간을 어떻게 다루느냐로
 * 값이 갈린다:
 *  - null을 0으로 채워서 EMA를 태우면 → 존재하지도 않는 0들이 시드에 섞여 시그널선이
 *    실제보다 0쪽으로 끌려간다. 즉 화면에 가짜 값이 그려진다.
 *  - 따라서 **null 구간은 아예 제외하고**, 첫 MACD 값부터를 하나의 시리즈로 보아
 *    EMA를 시작한다. 시드는 처음 signalPeriod개 MACD 값의 SMA가 된다.
 *    TradingView·바이낸스가 이 방식이며, 시그널선의 첫 값은 MACD선의 첫 값보다
 *    signalPeriod-1 개 뒤에 나온다.
 *
 * TRIX(`trix.ts`)의 2·3중 EMA도 "앞 구간이 null인 시리즈에 EMA를 다시 태운다"는
 * 똑같은 규칙이 필요해서 여기서 export해 재사용한다 — 돈 로직을 두 벌 두지 않기 위함이다.
 * (우리 입력에서 null은 항상 앞 구간에만 몰려 있다. 중간에 null이 섞여 들어오면
 *  그 시점은 건너뛰고 앞뒤를 이어 붙인다.)
 */
export function emaOfNullableSeries(
  series: readonly (number | null)[],
  period: number,
): (number | null)[] {
  const out: (number | null)[] = new Array<number | null>(series.length).fill(null);
  if (period <= 0) return out;

  // null을 걷어내고, 원래 인덱스를 기억해 둔다.
  const compact: number[] = [];
  const originalIndex: number[] = [];
  for (let i = 0; i < series.length; i++) {
    const v = series[i];
    if (v === null || v === undefined) continue;
    compact.push(v);
    originalIndex.push(i);
  }

  const emaVals = maSeries(compact, period, 'EMA');
  for (let j = 0; j < originalIndex.length; j++) {
    out[originalIndex[j]!] = emaVals[j] ?? null;
  }
  return out;
}

/**
 * 각 시점의 MACD를 배열로. 차트 보조지표 패인용.
 *
 * 길이는 항상 입력과 같고, 계산이 불가능한 앞 구간은 필드가 null이다.
 * period 중 하나라도 0 이하면 전 구간 null (다른 지표들과 같은 규약).
 *
 * fastPeriod >= slowPeriod 여도 식 자체는 정의되므로 막지 않는다 — 유저가 차트에서
 * 파라미터를 자유롭게 넣는 지표이고, 이 경우 MACD선의 부호가 뒤집힐 뿐이다.
 */
export function macdSeries(
  values: readonly number[],
  fastPeriod: number = MACD_FAST_PERIOD,
  slowPeriod: number = MACD_SLOW_PERIOD,
  signalPeriod: number = MACD_SIGNAL_PERIOD,
): MacdPoint[] {
  const empty = (): MacdPoint => ({ macd: null, signal: null, histogram: null });
  if (fastPeriod <= 0 || slowPeriod <= 0 || signalPeriod <= 0) {
    return values.map(empty);
  }

  const fast = maSeries(values, fastPeriod, 'EMA');
  const slow = maSeries(values, slowPeriod, 'EMA');

  // MACD선: 두 EMA가 모두 존재하는 시점부터 (= 느린 쪽이 만들어지는 시점부터)
  const macdLine: (number | null)[] = values.map((_, i) => {
    const f = fast[i];
    const s = slow[i];
    return f === null || f === undefined || s === null || s === undefined ? null : f - s;
  });

  const signalLine = emaOfNullableSeries(macdLine, signalPeriod);

  return values.map((_, i) => {
    const macd = macdLine[i] ?? null;
    const signal = signalLine[i] ?? null;
    const histogram = macd === null || signal === null ? null : macd - signal;
    return { macd, signal, histogram };
  });
}
