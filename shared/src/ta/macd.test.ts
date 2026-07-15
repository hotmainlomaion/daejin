import { describe, expect, it } from 'vitest';
import { MACD_FAST_PERIOD, MACD_SIGNAL_PERIOD, MACD_SLOW_PERIOD, macdSeries } from './macd.ts';

describe('macdSeries', () => {
  it('기본값이 바이낸스 차트와 같은 12/26/9다', () => {
    expect([MACD_FAST_PERIOD, MACD_SLOW_PERIOD, MACD_SIGNAL_PERIOD]).toEqual([12, 26, 9]);
  });

  it('손으로 검산한 알려진 입력에 대해 기대값을 낸다', () => {
    // values = [1, 2, 3, 4, 10], fast=2, slow=3, signal=2
    //
    // EMA(2) (k=2/3): 시드 sma([1,2]) = 1.5 (idx1)
    //   idx2: (2/3)*3  + (1/3)*1.5 = 2.5
    //   idx3: (2/3)*4  + (1/3)*2.5 = 3.5
    //   idx4: (2/3)*10 + (1/3)*3.5 = 47/6 = 7.83333
    // EMA(3) (k=1/2): 시드 sma([1,2,3]) = 2 (idx2)
    //   idx3: 0.5*4  + 0.5*2 = 3
    //   idx4: 0.5*10 + 0.5*3 = 6.5
    // MACD선 = EMA(2) - EMA(3):
    //   idx2: 2.5 - 2   = 0.5
    //   idx3: 3.5 - 3   = 0.5
    //   idx4: 47/6 - 6.5 = 4/3 = 1.33333
    // 시그널선 = MACD선 값들([0.5, 0.5, 4/3])의 EMA(2):
    //   시드 sma([0.5, 0.5]) = 0.5 → idx3
    //   idx4: (2/3)*(4/3) + (1/3)*0.5 = 19/18 = 1.05556
    // 히스토그램 = MACD선 - 시그널선:
    //   idx3: 0.5 - 0.5     = 0
    //   idx4: 4/3 - 19/18   = 5/18 = 0.27778
    const series = macdSeries([1, 2, 3, 4, 10], 2, 3, 2);

    expect(series[0]).toEqual({ macd: null, signal: null, histogram: null });
    expect(series[1]).toEqual({ macd: null, signal: null, histogram: null });

    // idx2: MACD선은 나왔지만 시그널선 시드(2개)가 아직 안 모였다
    expect(series[2]!.macd).toBeCloseTo(0.5, 10);
    expect(series[2]!.signal).toBeNull();
    expect(series[2]!.histogram).toBeNull();

    expect(series[3]!.macd).toBeCloseTo(0.5, 10);
    expect(series[3]!.signal).toBeCloseTo(0.5, 10);
    expect(series[3]!.histogram).toBeCloseTo(0, 10);

    expect(series[4]!.macd).toBeCloseTo(4 / 3, 10);
    expect(series[4]!.signal).toBeCloseTo(19 / 18, 10);
    expect(series[4]!.histogram).toBeCloseTo(5 / 18, 10);
  });

  it('시그널선은 MACD선의 null 구간을 0으로 채우지 않고 제외하고 시작한다', () => {
    // 위와 같은 입력. 두 방식의 답이 갈라지도록 고른 케이스다.
    //
    // 올바른 방식(null 제외): 시그널 idx4 = 19/18 = 1.05556 (위 검산)
    //
    // 틀린 방식(MACD선의 null을 0으로 채움): [0, 0, 0.5, 0.5, 4/3]에 EMA(2)를 태우면
    //   시드 sma([0,0]) = 0 (idx1)
    //   idx2: (2/3)*0.5 + (1/3)*0     = 1/3
    //   idx3: (2/3)*0.5 + (1/3)*(1/3) = 4/9
    //   idx4: (2/3)*(4/3) + (1/3)*(4/9) = 28/27 = 1.03704
    // 존재하지 않는 0들이 시드에 섞여 시그널선이 0쪽으로 끌려간 값이다.
    const series = macdSeries([1, 2, 3, 4, 10], 2, 3, 2);

    expect(series[4]!.signal).toBeCloseTo(19 / 18, 10); // 1.05556
    expect(series[4]!.signal).not.toBeCloseTo(28 / 27, 4); // 1.03704 (null=0 방식)
  });

  it('MACD선은 느린 EMA가 생기는 시점(slowPeriod-1)부터 나온다', () => {
    const series = macdSeries([1, 2, 3, 4, 5, 6, 7, 8], 2, 5, 2);
    for (let i = 0; i < 4; i++) {
      expect(series[i]!.macd).toBeNull();
    }
    expect(series[4]!.macd).not.toBeNull();
  });

  it('데이터가 부족하면 전부 null (길이는 유지)', () => {
    const series = macdSeries([1, 2, 3], MACD_FAST_PERIOD, MACD_SLOW_PERIOD, MACD_SIGNAL_PERIOD);
    expect(series).toHaveLength(3);
    for (const p of series) {
      expect(p).toEqual({ macd: null, signal: null, histogram: null });
    }
    expect(macdSeries([], 12, 26, 9)).toEqual([]);
  });

  it('period가 0 이하면 전부 null', () => {
    const allNull = [
      { macd: null, signal: null, histogram: null },
      { macd: null, signal: null, histogram: null },
      { macd: null, signal: null, histogram: null },
    ];
    expect(macdSeries([1, 2, 3], 0, 3, 2)).toEqual(allNull);
    expect(macdSeries([1, 2, 3], 2, 0, 2)).toEqual(allNull);
    expect(macdSeries([1, 2, 3], 2, 3, 0)).toEqual(allNull);
    expect(macdSeries([1, 2, 3], -1, -1, -1)).toEqual(allNull);
  });

  it('길이가 입력과 같다', () => {
    expect(macdSeries([1, 2, 3, 4, 10], 2, 3, 2)).toHaveLength(5);
  });

  it('히스토그램은 언제나 MACD선 - 시그널선이다', () => {
    const values = [10, 12, 11, 15, 14, 18, 20, 19, 17, 21, 22, 20, 23, 25, 24, 26];
    for (const p of macdSeries(values, 3, 5, 3)) {
      if (p.macd === null || p.signal === null) {
        expect(p.histogram).toBeNull();
        continue;
      }
      expect(p.histogram).toBeCloseTo(p.macd - p.signal, 10);
    }
  });

  it('룩어헤드가 없다 (각 시점 값이 그 시점까지만으로 계산한 값과 같다)', () => {
    // 미래 캔들이 과거 시점의 값을 바꾸면 차트가 거짓말을 한다
    const values = [
      44, 44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61,
      46.28,
    ];
    const series = macdSeries(values, 3, 5, 3);
    for (let i = 0; i < values.length; i++) {
      const prefix = macdSeries(values.slice(0, i + 1), 3, 5, 3);
      expect(series[i]).toEqual(prefix[i]);
    }
  });
});
