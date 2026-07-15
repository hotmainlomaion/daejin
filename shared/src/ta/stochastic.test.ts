import { describe, expect, it } from 'vitest';
import {
  KDJ_DEFAULT_D_SMOOTH,
  KDJ_DEFAULT_K_SMOOTH,
  KDJ_DEFAULT_PERIOD,
  STOCH_RSI_DEFAULT_D_SMOOTH,
  STOCH_RSI_DEFAULT_K_SMOOTH,
  STOCH_RSI_DEFAULT_RSI_PERIOD,
  STOCH_RSI_DEFAULT_STOCH_PERIOD,
  kdjSeries,
  stochRsiSeries,
} from './stochastic.ts';
import { rsiSeries } from './rsi.ts';
import type { Candle } from '../types.ts';

/** 테스트용 캔들. KDJ는 high/low/close만 보므로 나머지는 의미 없는 값으로 채운다. */
function candle(high: number, low: number, close: number): Candle {
  return { openTime: 0, open: close, high, low, close, volume: 100, closeTime: 0 };
}

/** 상승·하락·횡보가 섞인 고정 시퀀스 (랜덤 금지 — 실패가 재현돼야 한다). */
const fixtureCandles: Candle[] = [
  candle(45.0, 44.0, 44.5),
  candle(45.5, 44.2, 45.3),
  candle(46.0, 45.1, 45.2),
  candle(45.6, 44.0, 44.1),
  candle(44.8, 43.2, 44.6),
  candle(46.2, 44.5, 46.0),
  candle(47.0, 45.8, 46.1),
  candle(46.5, 45.0, 45.1),
  candle(45.4, 43.9, 44.0),
  candle(44.6, 43.0, 43.2),
  candle(45.0, 43.1, 44.9),
  candle(46.8, 44.7, 46.7),
  candle(47.5, 46.0, 46.2),
  candle(46.4, 45.2, 45.3),
  candle(46.0, 44.8, 45.9),
  candle(47.2, 45.5, 47.1),
];

describe('kdjSeries', () => {
  // 아래 여러 테스트가 공유하는 손계산 픽스처.
  // period=3 기준 RSV가 정확히 100, 100, 0 이 나오도록 고른 캔들이다.
  //  idx2: 창(0..2) 최고 10 / 최저 8 / 종가 10 → RSV = (10-8)/(10-8)*100 = 100
  //  idx3: 창(1..3) 최고 12 / 최저 8 / 종가 12 → RSV = (12-8)/(12-8)*100 = 100
  //  idx4: 창(2..4) 최고 12 / 최저 6 / 종가 6  → RSV = (6-6)/(12-6)*100  = 0
  const handChecked: Candle[] = [
    candle(10, 8, 9),
    candle(10, 8, 9),
    candle(10, 8, 10),
    candle(12, 8, 12),
    candle(12, 6, 6),
  ];

  it('1/3 가중 누적 평활을 거친 알려진 입력에 대해 기대값을 낸다', () => {
    // period=3, kSmooth=3, dSmooth=3. 시드는 K=D=50 (중립).
    // K = (2×K_전일 + RSV)/3, D = (2×D_전일 + K)/3, J = 3K − 2D
    //
    // idx2: K = (2×50 + 100)/3        = 66.6667
    //       D = (2×50 + 66.6667)/3    = 55.5556
    //       J = 3×66.6667 − 2×55.5556 = 88.8889
    // idx3: K = (2×66.6667 + 100)/3   = 77.7778
    //       D = (2×55.5556 + 77.7778)/3 = 62.9630
    //       J = 3×77.7778 − 2×62.9630 = 107.4074
    // idx4: K = (2×77.7778 + 0)/3     = 51.8519
    //       D = (2×62.9630 + 51.8519)/3 = 59.2593
    //       J = 3×51.8519 − 2×59.2593 = 37.0370
    const series = kdjSeries(handChecked, 3, 3, 3);
    expect(series[2]!.k).toBeCloseTo(66.6667, 4);
    expect(series[2]!.d).toBeCloseTo(55.5556, 4);
    expect(series[2]!.j).toBeCloseTo(88.8889, 4);
    expect(series[3]!.k).toBeCloseTo(77.7778, 4);
    expect(series[3]!.d).toBeCloseTo(62.963, 4);
    expect(series[3]!.j).toBeCloseTo(107.4074, 4);
    expect(series[4]!.k).toBeCloseTo(51.8519, 4);
    expect(series[4]!.d).toBeCloseTo(59.2593, 4);
    expect(series[4]!.j).toBeCloseTo(37.037, 4);
  });

  it('K/D 평활이 SMA가 아니라 1/3 가중 누적이다', () => {
    // ⚠️ 이 케이스는 두 방식의 답이 갈라지도록 고른 것이다. 우연히 같은 값이 나오는
    //    입력을 골랐다면 평활 방식을 아예 검증하지 못한다.
    //
    // idx4 시점의 RSV 3개는 100, 100, 0 이다.
    //  - SMA(3) 였다면       K = (100 + 100 + 0)/3 = 66.6667
    //  - 1/3 가중 누적이면   K = (2×77.7778 + 0)/3 = 51.8519
    // 두 값이 15pt 가까이 벌어지므로 구현이 바뀌면 반드시 이 테스트가 깨진다.
    const series = kdjSeries(handChecked, 3, 3, 3);
    expect(series[4]!.k).toBeCloseTo(51.8519, 4);
    expect(series[4]!.k).not.toBeCloseTo(66.6667, 1);

    // D도 마찬가지: SMA(3) 였다면 K 3개(66.6667, 77.7778, 51.8519)의 평균 = 65.4321
    expect(series[4]!.d).toBeCloseTo(59.2593, 4);
    expect(series[4]!.d).not.toBeCloseTo(65.4321, 1);
  });

  it('시드가 50(중립)이라 첫 K는 RSV와 다르다', () => {
    // 첫 RSV로 시드하는 구현이었다면 idx2의 K가 RSV(=100) 그대로 100이 됐을 것이다.
    const series = kdjSeries(handChecked, 3, 3, 3);
    expect(series[2]!.k).toBeCloseTo(66.6667, 4);
    expect(series[2]!.k).not.toBe(100);
  });

  it('기간 최고가 == 최저가면 RSV를 50(중립)으로 둔다 (0으로 나누기 방지)', () => {
    // 완전 횡보 — 최고가 == 최저가라 "최고이자 최저"라 위치를 정의할 수 없다.
    // RSV=50이 계속 들어오므로 시드(50)에서 K/D가 움직이지 않는다.
    const flat = [candle(10, 10, 10), candle(10, 10, 10), candle(10, 10, 10), candle(10, 10, 10)];
    const series = kdjSeries(flat, 3, 3, 3);
    expect(series[2]!.k).toBe(50);
    expect(series[2]!.d).toBe(50);
    expect(series[2]!.j).toBe(50); // 3×50 − 2×50
    expect(series[3]!.k).toBe(50);
    // NaN/Infinity가 새지 않는다
    for (const v of series) {
      if (v.k === null) continue;
      expect(Number.isFinite(v.k)).toBe(true);
      expect(Number.isFinite(v.d!)).toBe(true);
      expect(Number.isFinite(v.j!)).toBe(true);
    }
  });

  it('데이터가 부족한 앞 구간은 null', () => {
    // period=3이면 최고/최저 창이 차는 인덱스 2부터 값이 생긴다
    const series = kdjSeries(handChecked, 3, 3, 3);
    expect(series[0]).toEqual({ k: null, d: null, j: null });
    expect(series[1]).toEqual({ k: null, d: null, j: null });
    expect(series[2]!.k).not.toBeNull();
  });

  it('캔들 수가 period 미만이면 전부 null', () => {
    expect(kdjSeries([candle(10, 8, 9), candle(11, 9, 10)], 3, 3, 3)).toEqual([
      { k: null, d: null, j: null },
      { k: null, d: null, j: null },
    ]);
    expect(kdjSeries([], 9, 3, 3)).toEqual([]);
  });

  it('period·kSmooth·dSmooth가 0 이하면 전부 null', () => {
    const allNull = [
      { k: null, d: null, j: null },
      { k: null, d: null, j: null },
      { k: null, d: null, j: null },
      { k: null, d: null, j: null },
      { k: null, d: null, j: null },
    ];
    expect(kdjSeries(handChecked, 0, 3, 3)).toEqual(allNull);
    expect(kdjSeries(handChecked, -1, 3, 3)).toEqual(allNull);
    expect(kdjSeries(handChecked, 3, 0, 3)).toEqual(allNull);
    expect(kdjSeries(handChecked, 3, 3, -2)).toEqual(allNull);
  });

  it('길이가 입력과 같다', () => {
    expect(kdjSeries(fixtureCandles, 9, 3, 3)).toHaveLength(fixtureCandles.length);
    // 데이터가 부족해도 길이는 유지한다
    expect(kdjSeries(fixtureCandles.slice(0, 2), 9, 3, 3)).toHaveLength(2);
  });

  it('각 시점 값이 그 시점까지의 캔들만으로 계산한 값과 같다 (룩어헤드 없음)', () => {
    const series = kdjSeries(fixtureCandles, 5, 3, 3);
    for (let i = 0; i < fixtureCandles.length; i++) {
      const prefix = kdjSeries(fixtureCandles.slice(0, i + 1), 5, 3, 3);
      expect(series[i]).toEqual(prefix[i]);
    }
  });

  it('K와 D는 항상 0~100 범위 안에 있다', () => {
    // K/D는 50 시드와 RSV(0~100)의 볼록결합이라 구간을 벗어날 수 없다
    for (const period of [3, 5, 9]) {
      for (const v of kdjSeries(fixtureCandles, period, 3, 3)) {
        if (v.k === null) continue;
        expect(v.k).toBeGreaterThanOrEqual(0);
        expect(v.k).toBeLessThanOrEqual(100);
        expect(v.d!).toBeGreaterThanOrEqual(0);
        expect(v.d!).toBeLessThanOrEqual(100);
      }
    }
  });

  it('J는 3K − 2D이며 0~100을 벗어날 수 있다 (의도된 성질)', () => {
    const series = kdjSeries(fixtureCandles, 5, 3, 3);
    for (const v of series) {
      if (v.k === null) continue;
      expect(v.j).toBeCloseTo(3 * v.k - 2 * v.d!, 10);
    }
    // 위 손계산 픽스처에서 J = 107.4074 로 이미 100을 넘겼다 (클램프하지 않는다는 확인)
    expect(kdjSeries(handChecked, 3, 3, 3)[3]!.j!).toBeGreaterThan(100);
  });

  it('기본값은 9, 3, 3이다', () => {
    expect(KDJ_DEFAULT_PERIOD).toBe(9);
    expect(KDJ_DEFAULT_K_SMOOTH).toBe(3);
    expect(KDJ_DEFAULT_D_SMOOTH).toBe(3);
    // 인자를 생략하면 기본값이 적용된다
    expect(kdjSeries(fixtureCandles)).toEqual(kdjSeries(fixtureCandles, 9, 3, 3));
  });
});

describe('stochRsiSeries', () => {
  // 손계산 픽스처. rsiPeriod=2의 RSI(Wilder)는 다음과 같다 (rsi.ts 규약):
  //  values: [10, 11, 10.5, 11.5, 10, 12, 11]
  //  RSI:    [null, null, 66.6667, 85.7143, 31.5789, 74.5098, 45.7831]
  const handChecked = [10, 11, 10.5, 11.5, 10, 12, 11];

  it('RSI에 스토캐스틱을 적용한 알려진 입력에 대해 기대값을 낸다', () => {
    // rsiPeriod=2, stochPeriod=3, kSmooth=1, dSmooth=1 (평활 없음 → 원시 StochRSI가 그대로 K)
    //
    // idx4: RSI 창(2..4) = [66.6667, 85.7143, 31.5789], 현재 31.5789 = 최저
    //       → (31.5789 − 31.5789)/(85.7143 − 31.5789) × 100 = 0
    // idx5: RSI 창(3..5) = [85.7143, 31.5789, 74.5098], 현재 74.5098
    //       → (74.5098 − 31.5789)/(85.7143 − 31.5789) × 100
    //       = 42.9309 / 54.1353 × 100 = 79.3028
    const series = stochRsiSeries(handChecked, 2, 3, 1, 1);
    expect(series[4]!.k).toBeCloseTo(0, 10);
    expect(series[5]!.k).toBeCloseTo(79.3028, 4);
    // kSmooth=dSmooth=1이면 D == K
    expect(series[5]!.d).toBeCloseTo(79.3028, 4);
  });

  it('K는 원시 StochRSI의 SMA(kSmooth), D는 K의 SMA(dSmooth)다', () => {
    // 원시 StochRSI: idx4 = 0, idx5 = 79.3028, idx6 = 33.0862
    // kSmooth=2 → K(idx5) = (0 + 79.3028)/2 = 39.6514
    //             K(idx6) = (79.3028 + 33.0862)/2 = 56.1945
    // dSmooth=2 → D(idx6) = (39.6514 + 56.1945)/2 = 47.9230
    const series = stochRsiSeries(handChecked, 2, 3, 2, 2);
    expect(series[5]!.k).toBeCloseTo(39.6514, 4);
    expect(series[5]!.d).toBeNull(); // K가 2개 모이기 전이라 D는 아직 없다
    expect(series[6]!.k).toBeCloseTo(56.1945, 4);
    expect(series[6]!.d).toBeCloseTo(47.923, 4);
  });

  it('가격이 아니라 RSI에 스토캐스틱을 적용한다', () => {
    // ⚠️ 이 지표의 정의 자체를 고정하는 테스트다. 가격에 적용하면 그건 KDJ지 StochRSI가 아니다.
    //
    // idx5의 최근 3개 **종가**는 [11.5, 10, 12]이고 현재 종가 12가 창의 최고가다.
    // → 가격에 스토캐스틱을 적용했다면 K = 100 이 나왔을 것이다.
    // 실제로는 RSI 창 [85.7143, 31.5789, 74.5098] 안에서 74.5098이 최고가 아니므로 79.3028이다.
    const series = stochRsiSeries(handChecked, 2, 3, 1, 1);
    expect(series[5]!.k).toBeCloseTo(79.3028, 4);
    expect(series[5]!.k).not.toBeCloseTo(100, 1);
  });

  it('단조 상승이어도 100이 아니다 (RSI가 100에 붙어 평평해지므로)', () => {
    // 가격 기준 스토캐스틱이라면 매 캔들이 신고가라 K = 100 이다.
    // 그러나 RSI는 전 구간 100으로 평평하므로 최고 == 최저 → 0으로 나누기 → 50(중립).
    // 가격 스토캐스틱과 RSI 스토캐스틱의 답이 극단적으로 갈라지는 지점이다.
    expect(rsiSeries([1, 2, 3, 4, 5, 6], 2)).toEqual([null, null, 100, 100, 100, 100]);
    const series = stochRsiSeries([1, 2, 3, 4, 5, 6], 2, 2, 1, 1);
    expect(series[3]!.k).toBe(50);
    expect(series[5]!.k).toBe(50);
    expect(series[5]!.k).not.toBe(100);
  });

  it('rsiSeries()를 그대로 재사용한다 (독립 계산한 RSI 스토캐스틱과 일치)', () => {
    // 차트의 RSI 패인과 StochRSI가 다른 RSI를 보면 안 되므로 이 성질이 핵심이다.
    const values = fixtureCandles.map((c) => c.close);
    const rsis = rsiSeries(values, 5);
    const series = stochRsiSeries(values, 5, 4, 1, 1);

    for (let i = 0; i < values.length; i++) {
      const window = rsis.slice(i - 3, i + 1);
      if (i < 3 || window.some((r) => r === null)) continue;
      const nums = window as number[];
      const highest = Math.max(...nums);
      const lowest = Math.min(...nums);
      const expected = highest === lowest ? 50 : ((rsis[i]! - lowest) / (highest - lowest)) * 100;
      expect(series[i]!.k).toBeCloseTo(expected, 10);
    }
  });

  it('기간 RSI 최고 == 최저면 50(중립)으로 둔다 (0으로 나누기 방지)', () => {
    // 가격이 전혀 움직이지 않으면 rsi.ts 규약상 RSI가 계속 50이다 → RSI 창이 평평 → 50
    const series = stochRsiSeries([10, 10, 10, 10, 10, 10], 2, 3, 1, 1);
    expect(rsiSeries([10, 10, 10, 10, 10, 10], 2)).toEqual([null, null, 50, 50, 50, 50]);
    expect(series[4]!.k).toBe(50);
    expect(series[5]!.k).toBe(50);
    for (const v of series) {
      if (v.k === null) continue;
      expect(Number.isFinite(v.k)).toBe(true);
    }
  });

  it('RSI가 아직 없는 앞 구간은 null (null을 0으로 치환하지 않는다)', () => {
    // rsiPeriod=2면 RSI는 인덱스 2부터, stochPeriod=3이면 창이 차는 인덱스 4부터 K가 생긴다.
    // null을 0으로 채워 평균을 냈다면 앞 구간에 가짜 값이 찍혔을 것이다.
    const series = stochRsiSeries(handChecked, 2, 3, 1, 1);
    expect(series[0]).toEqual({ k: null, d: null });
    expect(series[1]).toEqual({ k: null, d: null });
    expect(series[2]).toEqual({ k: null, d: null });
    expect(series[3]).toEqual({ k: null, d: null });
    expect(series[4]!.k).not.toBeNull();
  });

  it('데이터가 부족하면 전부 null', () => {
    expect(stochRsiSeries([1, 2, 3], 14, 14, 3, 3)).toEqual([
      { k: null, d: null },
      { k: null, d: null },
      { k: null, d: null },
    ]);
    expect(stochRsiSeries([], 14, 14, 3, 3)).toEqual([]);
  });

  it('기간 인자가 0 이하면 전부 null', () => {
    const allNull = handChecked.map(() => ({ k: null, d: null }));
    expect(stochRsiSeries(handChecked, 0, 3, 1, 1)).toEqual(allNull);
    expect(stochRsiSeries(handChecked, 2, 0, 1, 1)).toEqual(allNull);
    expect(stochRsiSeries(handChecked, 2, 3, 0, 1)).toEqual(allNull);
    expect(stochRsiSeries(handChecked, 2, 3, 1, -1)).toEqual(allNull);
  });

  it('길이가 입력과 같다', () => {
    const values = fixtureCandles.map((c) => c.close);
    expect(stochRsiSeries(values, 5, 4, 3, 3)).toHaveLength(values.length);
    expect(stochRsiSeries(values, 14, 14, 3, 3)).toHaveLength(values.length);
  });

  it('각 시점 값이 그 시점까지의 값만으로 계산한 값과 같다 (룩어헤드 없음)', () => {
    const values = fixtureCandles.map((c) => c.close);
    const series = stochRsiSeries(values, 3, 3, 2, 2);
    for (let i = 0; i < values.length; i++) {
      const prefix = stochRsiSeries(values.slice(0, i + 1), 3, 3, 2, 2);
      expect(series[i]).toEqual(prefix[i]);
    }
  });

  it('K와 D는 항상 0~100 범위 안에 있다', () => {
    const values = fixtureCandles.map((c) => c.close);
    for (const rsiPeriod of [2, 3, 5]) {
      for (const v of stochRsiSeries(values, rsiPeriod, 4, 3, 3)) {
        if (v.k === null) continue;
        expect(v.k).toBeGreaterThanOrEqual(0);
        expect(v.k).toBeLessThanOrEqual(100);
        if (v.d === null) continue;
        expect(v.d).toBeGreaterThanOrEqual(0);
        expect(v.d).toBeLessThanOrEqual(100);
      }
    }
  });

  it('기본값은 14, 14, 3, 3이다', () => {
    expect(STOCH_RSI_DEFAULT_RSI_PERIOD).toBe(14);
    expect(STOCH_RSI_DEFAULT_STOCH_PERIOD).toBe(14);
    expect(STOCH_RSI_DEFAULT_K_SMOOTH).toBe(3);
    expect(STOCH_RSI_DEFAULT_D_SMOOTH).toBe(3);
    const values = fixtureCandles.map((c) => c.close);
    expect(stochRsiSeries(values)).toEqual(stochRsiSeries(values, 14, 14, 3, 3));
  });
});
