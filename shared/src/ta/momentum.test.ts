import { describe, expect, it } from 'vitest';
import type { Candle } from '../types.ts';
import { MTM_PERIOD, WILLIAMS_R_PERIOD, mtmSeries, williamsRSeries } from './momentum.ts';

/** 테스트용 캔들. %R은 high/low/close만 보므로 나머지는 값이 있기만 하면 된다. */
function candle(high: number, low: number, close: number): Candle {
  return { openTime: 0, open: low, high, low, close, volume: 1, closeTime: 0 };
}

describe('mtmSeries', () => {
  it('기본 period가 바이낸스 차트와 같은 12다', () => {
    expect(MTM_PERIOD).toBe(12);
  });

  it('현재가 - period 이전 가격 (단순 차이)', () => {
    // period=2 → idx2: 12-10 = 2 / idx3: 13-11 = 2 / idx4: 20-12 = 8
    expect(mtmSeries([10, 11, 12, 13, 20], 2)).toEqual([null, null, 2, 2, 8]);
  });

  it('비율(%)이 아니라 차이다', () => {
    // 두 방식의 답이 갈라지도록 기준가를 2로 잡은 케이스다 (period=2).
    //   차이  = 6 - 2         = 4        ← MTM
    //   변화율 = (6/2 - 1)*100 = 200      ← 이 값이 나오면 변화율로 잘못 구현한 것
    // 기준가가 100 근처면 두 값이 비슷해져 버그를 못 잡는다.
    expect(mtmSeries([2, 3, 6], 2)[2]).toBe(4);
    expect(mtmSeries([2, 3, 6], 2)[2]).not.toBe(200);
  });

  it('하락 구간에서는 음수', () => {
    expect(mtmSeries([20, 15, 10], 2)).toEqual([null, null, -10]);
  });

  it('데이터가 부족하면 전부 null (길이는 유지)', () => {
    // 인덱스 i의 값은 values[i-period]가 있어야 하므로 period+1개가 필요하다
    expect(mtmSeries([10, 11], 2)).toEqual([null, null]);
    expect(mtmSeries([10, 11, 12], MTM_PERIOD)).toEqual([null, null, null]);
    expect(mtmSeries([], 12)).toEqual([]);
    // 딱 period+1개면 계산된다
    expect(mtmSeries([10, 11, 12], 2)[2]).toBe(2);
  });

  it('period가 0 이하면 전부 null', () => {
    expect(mtmSeries([10, 11, 12], 0)).toEqual([null, null, null]);
    expect(mtmSeries([10, 11, 12], -1)).toEqual([null, null, null]);
  });

  it('길이가 입력과 같다', () => {
    expect(mtmSeries([1, 2, 3, 4, 5], 2)).toHaveLength(5);
  });

  it('룩어헤드가 없다 (각 시점 값이 그 시점까지만으로 계산한 값과 같다)', () => {
    const values = [44, 44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42];
    const series = mtmSeries(values, 3);
    for (let i = 0; i < values.length; i++) {
      expect(series[i]).toBe(mtmSeries(values.slice(0, i + 1), 3)[i]);
    }
  });
});

describe('williamsRSeries', () => {
  it('기본 period가 바이낸스 차트와 같은 14다', () => {
    expect(WILLIAMS_R_PERIOD).toBe(14);
  });

  it('손으로 검산한 알려진 입력에 대해 기대값을 낸다', () => {
    // period=3, 캔들 (high, low, close):
    //   c0 (10, 8, 9) / c1 (12, 9, 11) / c2 (11, 7, 8) / c3 (13, 10, 12)
    //
    // idx2 (윈도 c0~c2): 최고가 12, 최저가 7, 종가 8
    //   %R = (12 - 8) / (12 - 7) * -100 = 0.8 * -100 = -80
    // idx3 (윈도 c1~c3): 최고가 13, 최저가 7, 종가 12
    //   %R = (13 - 12) / (13 - 7) * -100 = (1/6) * -100 = -16.6667
    const candles = [candle(10, 8, 9), candle(12, 9, 11), candle(11, 7, 8), candle(13, 10, 12)];
    const series = williamsRSeries(candles, 3);

    expect(series[0]).toBeNull();
    expect(series[1]).toBeNull();
    expect(series[2]).toBeCloseTo(-80, 10);
    expect(series[3]).toBeCloseTo(-100 / 6, 10);
  });

  it('최고/최저를 종가가 아니라 캔들의 high/low로 잡는다', () => {
    // 두 방식의 답이 갈라지도록 고른 케이스다. 위와 같은 입력의 idx2에서
    // 종가만 봤다면 최고 max(9,11,8) = 11, 최저 min(9,11,8) = 8, 종가 8 →
    //   %R = (11 - 8) / (11 - 8) * -100 = -100
    // high/low를 제대로 보면 -80이다. -100이 나오면 종가로 구현한 것.
    const candles = [candle(10, 8, 9), candle(12, 9, 11), candle(11, 7, 8), candle(13, 10, 12)];
    expect(williamsRSeries(candles, 3)[2]).toBeCloseTo(-80, 10);
    expect(williamsRSeries(candles, 3)[2]).not.toBeCloseTo(-100, 4);
  });

  it('종가가 기간 최고가면 0, 최저가면 -100', () => {
    // 종가 == 기간 최고가 → 분자가 0 (JS에서 0 * -100 = -0 이라 toBeCloseTo로 본다)
    const atHigh = [candle(10, 5, 6), candle(12, 6, 12)];
    expect(williamsRSeries(atHigh, 2)[1]).toBeCloseTo(0, 10);
    const atLow = [candle(10, 8, 9), candle(9, 5, 5)];
    expect(williamsRSeries(atLow, 2)[1]).toBe(-100);
  });

  it('최고가 == 최저가면 -50 (0으로 나누기 방지)', () => {
    // 구간이 완전히 평평해 0/0. 중립값 -50 (momentum.ts 주석 참조).
    const flat = [candle(5, 5, 5), candle(5, 5, 5), candle(5, 5, 5)];
    const series = williamsRSeries(flat, 3);
    expect(series[2]).toBe(-50);
    // Infinity/NaN이 새어나오지 않는지
    expect(Number.isFinite(series[2]!)).toBe(true);
  });

  it('항상 -100 ~ 0 범위 안에 있다', () => {
    // 상승·하락·횡보가 섞인 고정 시퀀스 (랜덤 금지 — 실패가 재현돼야 한다)
    const closes = [
      44, 44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61,
      46.28, 46.28, 46, 46.03, 46.41, 46.22, 45.64, 46.21, 46.25, 45.71, 46.45, 45.78, 45.35, 44.03,
      44.18, 44.22, 44.57, 43.42, 42.66, 43.13,
    ];
    const candles = closes.map((c) => candle(c + 0.5, c - 0.5, c));
    for (const period of [2, 5, 14]) {
      for (const v of williamsRSeries(candles, period)) {
        if (v === null) continue;
        expect(v).toBeGreaterThanOrEqual(-100);
        expect(v).toBeLessThanOrEqual(0);
      }
    }
  });

  it('데이터가 부족하면 전부 null (길이는 유지)', () => {
    const candles = [candle(10, 8, 9), candle(12, 9, 11)];
    expect(williamsRSeries(candles, 3)).toEqual([null, null]);
    expect(williamsRSeries(candles, WILLIAMS_R_PERIOD)).toEqual([null, null]);
    expect(williamsRSeries([], 14)).toEqual([]);
    // 딱 period개면 계산된다
    expect(williamsRSeries(candles, 2)[1]).not.toBeNull();
  });

  it('period가 0 이하면 전부 null', () => {
    const candles = [candle(10, 8, 9), candle(12, 9, 11)];
    expect(williamsRSeries(candles, 0)).toEqual([null, null]);
    expect(williamsRSeries(candles, -1)).toEqual([null, null]);
  });

  it('길이가 입력과 같다', () => {
    const candles = [candle(10, 8, 9), candle(12, 9, 11), candle(11, 7, 8), candle(13, 10, 12)];
    expect(williamsRSeries(candles, 2)).toHaveLength(4);
  });

  it('룩어헤드가 없다 (각 시점 값이 그 시점까지만으로 계산한 값과 같다)', () => {
    const candles = [
      candle(10, 8, 9),
      candle(12, 9, 11),
      candle(11, 7, 8),
      candle(13, 10, 12),
      candle(14, 11, 11),
      candle(12, 9, 10),
      candle(15, 10, 14),
    ];
    const series = williamsRSeries(candles, 3);
    for (let i = 0; i < candles.length; i++) {
      expect(series[i]).toBe(williamsRSeries(candles.slice(0, i + 1), 3)[i]);
    }
  });
});
