import { describe, expect, it } from 'vitest';
import type { Candle } from '../types.ts';
import { CCI_CONSTANT, CCI_PERIOD, cciSeries } from './cci.ts';

/** 테스트용 캔들. CCI는 high/low/close만 보므로 나머지는 값이 있기만 하면 된다. */
function candle(high: number, low: number, close: number): Candle {
  return { openTime: 0, open: low, high, low, close, volume: 1, closeTime: 0 };
}

describe('cciSeries', () => {
  it('기본값이 바이낸스 차트와 같은 period=20, 상수 0.015다', () => {
    expect(CCI_PERIOD).toBe(20);
    expect(CCI_CONSTANT).toBe(0.015);
  });

  it('손으로 검산한 알려진 입력에 대해 기대값을 낸다', () => {
    // period=4, 캔들 (high, low, close) → TP = (h+l+c)/3:
    //   c0 ( 3, 0, 0) → TP = 3/3  = 1
    //   c1 ( 9, 3, 3) → TP = 15/3 = 5
    //   c2 (10, 4, 4) → TP = 18/3 = 6
    //   c3 (13, 5, 6) → TP = 24/3 = 8
    //
    // SMA(TP, 4) = (1+5+6+8)/4 = 5
    // 평균절대편차 = (|1-5| + |5-5| + |6-5| + |8-5|) / 4 = (4+0+1+3)/4 = 2
    // CCI = (TP_last - SMA) / (0.015 * MAD) = (8 - 5) / (0.015 * 2) = 3 / 0.03 = 100
    const candles = [candle(3, 0, 0), candle(9, 3, 3), candle(10, 4, 4), candle(13, 5, 6)];
    const series = cciSeries(candles, 4);

    expect(series[0]).toBeNull();
    expect(series[1]).toBeNull();
    expect(series[2]).toBeNull();
    expect(series[3]).toBeCloseTo(100, 6);
  });

  it('분모가 표준편차가 아니라 평균절대편차다', () => {
    // ⚠️ 이 프로젝트에서 가장 중요한 CCI 테스트다.
    // 위와 같은 입력(TP = [1, 5, 6, 8], SMA = 5)에서 각 방식의 답이 갈라진다:
    //
    //   평균절대편차 = (4+0+1+3)/4 = 2
    //     → CCI = 3 / (0.015 * 2) = 100                    ← 올바른 값
    //   모표준편차   = sqrt((16+0+1+9)/4) = sqrt(6.5) = 2.5495
    //     → CCI = 3 / (0.015 * 2.5495) = 78.446            ← 표준편차로 잘못 구현한 값
    //   표본표준편차 = sqrt((16+0+1+9)/3) = sqrt(8.6667) = 2.9439
    //     → CCI = 3 / (0.015 * 2.9439) = 67.937            ← n-1로 잘못 구현한 값
    //
    // 편차가 [4,0,1,3]으로 흩어져 있어야 세 값이 벌어진다. 편차가 전부 같은 윈도
    // (예: TP = [1,2,3,4])를 쓰면 MAD == 표준편차라 우연히 같은 값이 나와서
    // 아무것도 검증하지 못한다.
    const candles = [candle(3, 0, 0), candle(9, 3, 3), candle(10, 4, 4), candle(13, 5, 6)];
    const cci = cciSeries(candles, 4)[3]!;

    expect(cci).toBeCloseTo(100, 6);
    expect(cci).not.toBeCloseTo(78.446, 2); // 모표준편차
    expect(cci).not.toBeCloseTo(67.937, 2); // 표본표준편차
  });

  it('종가나 중간값이 아니라 전형가 (high+low+close)/3 를 쓴다', () => {
    // 같은 입력. h/l/c가 서로 다르고 TP와도 다르도록 골라서, 다른 가격을 쓰면 값이 갈라진다:
    //   종가만([0, 3, 4, 6]):        SMA = 3.25,  MAD = 1.75    → CCI = 2.75 / 0.02625 = 104.76
    //   중간값 (h+l)/2([1.5,6,7,9]): SMA = 5.875, MAD = 2.1875  → CCI = 3.125 / 0.0328125 = 95.24
    //   전형가 ([1, 5, 6, 8]):                                  → CCI = 100  ← 올바른 값
    const candles = [candle(3, 0, 0), candle(9, 3, 3), candle(10, 4, 4), candle(13, 5, 6)];
    const cci = cciSeries(candles, 4)[3]!;

    expect(cci).toBeCloseTo(100, 6);
    expect(cci).not.toBeCloseTo(104.76, 1); // 종가
    expect(cci).not.toBeCloseTo(95.24, 1); // 중간값
  });

  it('평균절대편차가 0이면 0 (0으로 나누기 방지)', () => {
    // TP가 전부 같아 편차가 없다 → 분자도 0이라 0/0. 중립값 0 (cci.ts 주석 참조).
    const flat = [candle(9, 3, 3), candle(9, 3, 3), candle(9, 3, 3)];
    const series = cciSeries(flat, 3);
    expect(series[2]).toBe(0);
    // Infinity/NaN이 새어나오지 않는지
    expect(Number.isFinite(series[2]!)).toBe(true);
  });

  it('TP가 평균 위면 양수, 아래면 음수', () => {
    const up = [candle(3, 0, 0), candle(9, 3, 3), candle(13, 5, 6)];
    expect(cciSeries(up, 3)[2]!).toBeGreaterThan(0);
    const down = [candle(13, 5, 6), candle(9, 3, 3), candle(3, 0, 0)];
    expect(cciSeries(down, 3)[2]!).toBeLessThan(0);
  });

  it('데이터가 부족하면 전부 null (길이는 유지)', () => {
    const candles = [candle(3, 0, 0), candle(9, 3, 3)];
    expect(cciSeries(candles, 3)).toEqual([null, null]);
    expect(cciSeries(candles, CCI_PERIOD)).toEqual([null, null]);
    expect(cciSeries([], 20)).toEqual([]);
    // 딱 period개면 계산된다
    expect(cciSeries(candles, 2)[1]).not.toBeNull();
  });

  it('period가 0 이하면 전부 null', () => {
    const candles = [candle(3, 0, 0), candle(9, 3, 3)];
    expect(cciSeries(candles, 0)).toEqual([null, null]);
    expect(cciSeries(candles, -1)).toEqual([null, null]);
  });

  it('길이가 입력과 같다', () => {
    const candles = [candle(3, 0, 0), candle(9, 3, 3), candle(10, 4, 4), candle(13, 5, 6)];
    expect(cciSeries(candles, 2)).toHaveLength(4);
  });

  it('룩어헤드가 없다 (각 시점 값이 그 시점까지만으로 계산한 값과 같다)', () => {
    const closes = [
      44, 44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03,
    ];
    const candles = closes.map((c) => candle(c + 0.5, c - 0.5, c));
    const series = cciSeries(candles, 4);
    for (let i = 0; i < candles.length; i++) {
      expect(series[i]).toBe(cciSeries(candles.slice(0, i + 1), 4)[i]);
    }
  });
});
