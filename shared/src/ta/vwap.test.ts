import { describe, expect, it } from 'vitest';
import type { Candle } from '../types.ts';
import { avlSeries, vwapSeries } from './vwap.ts';

/**
 * 테스트용 캔들 하나. VWAP/AVL은 high·low·close·volume만 보므로
 * 나머지 필드는 인덱스에서 기계적으로 채운다.
 */
function candle(i: number, high: number, low: number, close: number, volume: number): Candle {
  return {
    openTime: i * 60_000,
    open: low,
    high,
    low,
    close,
    volume,
    closeTime: (i + 1) * 60_000 - 1,
  };
}

/**
 * 손 계산용 고정 캔들 3개.
 * 전형가(tp) = (고가+저가+종가)/3 이 종가와 다르도록 일부러 골랐다 —
 * tp 대신 종가를 쓰는 구현이 우연히 같은 값을 내지 않게 하기 위함이다.
 *
 * i=0: h=12, l=6,  c=12 → tp = 30/3 = 10, vol=10
 * i=1: h=20, l=10, c=18 → tp = 48/3 = 16, vol=30
 * i=2: h=30, l=15, c=24 → tp = 69/3 = 23, vol=20
 */
const candles: Candle[] = [
  candle(0, 12, 6, 12, 10),
  candle(1, 20, 10, 18, 30),
  candle(2, 30, 15, 24, 20),
];

describe('vwapSeries', () => {
  it('누적 거래량 가중 평균가를 낸다 (손 계산 검증)', () => {
    // i=0: Σ(tp*v) = 10*10 = 100,                 Σv = 10 → 100/10  = 10
    // i=1: Σ(tp*v) = 100 + 16*30 = 580,           Σv = 40 → 580/40  = 14.5
    // i=2: Σ(tp*v) = 580 + 23*20 = 1040,          Σv = 60 → 1040/60 = 17.3333...
    const series = vwapSeries(candles);
    expect(series[0]).toBe(10);
    expect(series[1]).toBe(14.5);
    expect(series[2]).toBeCloseTo(17.3333333333, 10);
  });

  it('거래량 가중이며 전형가 기준이다 (다른 정의와 값이 갈라진다)', () => {
    // ⚠️ 이 케이스는 "다른 방식으로 계산해도 우연히 같은 값"을 피하려고 고른 것이다.
    // 같은 캔들에 대해 흔한 오구현들의 답:
    //  - 거래량 가중 없이 전형가 단순 누적 평균: (10+16+23)/3 = 16.3333...
    //  - 전형가 대신 종가로 거래량 가중: (12*10 + 18*30 + 24*20)/60 = 1140/60 = 19
    // 우리 값 17.3333...은 둘 다와 다르다.
    const last = vwapSeries(candles)[2]!;
    expect(last).not.toBeCloseTo(16.3333333333, 4); // 단순 평균이 아니다
    expect(last).not.toBeCloseTo(19, 4); // 종가 기준이 아니다
  });

  it('거래량이 큰 캔들 쪽으로 값이 끌린다', () => {
    // 같은 전형가 10 / 20인 캔들 두 개. 거래량이 9:1이면 10 쪽에 가까워야 한다.
    // Σ(tp*v) = 10*90 + 20*10 = 1100, Σv = 100 → 11
    const weighted = vwapSeries([candle(0, 12, 8, 10, 90), candle(1, 22, 18, 20, 10)]);
    expect(weighted[1]).toBe(11);
  });

  it('거래량 합이 0이면 null (0으로 나누기 방지)', () => {
    const noVolume = [candle(0, 12, 6, 12, 0), candle(1, 20, 10, 18, 0)];
    expect(vwapSeries(noVolume)).toEqual([null, null]);
  });

  it('앞 구간만 거래량이 0이면 그 구간만 null이고 이후는 계산된다', () => {
    // i=0: Σv = 0 → null
    // i=1: Σ(tp*v) = 0 + 16*30 = 480, Σv = 30 → 16 (= 두 번째 캔들의 전형가)
    const series = vwapSeries([candle(0, 12, 6, 12, 0), candle(1, 20, 10, 18, 30)]);
    expect(series[0]).toBeNull();
    expect(series[1]).toBe(16);
  });

  it('거래량 0인 캔들은 이후 값을 바꾸지 않는다', () => {
    // 거래가 없는 캔들은 분자·분모에 0을 더할 뿐이다
    const withGap = vwapSeries([candles[0]!, candle(9, 99, 1, 50, 0), candles[1]!, candles[2]!]);
    expect(withGap[3]).toBeCloseTo(17.3333333333, 10);
  });

  it('길이가 입력과 같고 빈 배열이면 빈 배열', () => {
    expect(vwapSeries(candles)).toHaveLength(3);
    expect(vwapSeries([])).toEqual([]);
  });

  it('캔들 하나면 그 캔들의 전형가', () => {
    expect(vwapSeries([candles[0]!])).toEqual([10]);
  });

  it('각 시점 값이 그 시점까지의 캔들만으로 계산된다 (룩어헤드 없음)', () => {
    const full = vwapSeries(candles);
    for (let i = 0; i < candles.length; i++) {
      const partial = vwapSeries(candles.slice(0, i + 1));
      expect(partial[i]).toBe(full[i]);
    }
  });
});

describe('avlSeries', () => {
  it('누적 거래량 가중 평균가를 낸다 (손 계산 검증)', () => {
    // vwapSeries와 같은 손 계산. 정의가 확정되면 갈라질 수 있으므로
    // "vwap과 같다"에 기대지 않고 기대값을 독립적으로 고정한다.
    const series = avlSeries(candles);
    expect(series[0]).toBe(10);
    expect(series[1]).toBe(14.5);
    expect(series[2]).toBeCloseTo(17.3333333333, 10);
  });

  it('거래량 합이 0이면 null (0으로 나누기 방지)', () => {
    expect(avlSeries([candle(0, 12, 6, 12, 0)])).toEqual([null]);
  });

  it('길이가 입력과 같고 빈 배열이면 빈 배열', () => {
    expect(avlSeries(candles)).toHaveLength(3);
    expect(avlSeries([])).toEqual([]);
  });

  it('각 시점 값이 그 시점까지의 캔들만으로 계산된다 (룩어헤드 없음)', () => {
    const full = avlSeries(candles);
    for (let i = 0; i < candles.length; i++) {
      const partial = avlSeries(candles.slice(0, i + 1));
      expect(partial[i]).toBe(full[i]);
    }
  });

  it('현재 정의로는 VWAP과 값이 같다 (TODO(confirm) 해소 시 이 테스트가 깨진다)', () => {
    // vwap.ts의 TODO(confirm) 참조: 바이낸스 AVL의 정확한 정의를 확인하지 못해
    // 두 지표를 같은 식으로 두고 있다. 정의가 확정돼 갈라지면 이 테스트가
    // 실패하면서 "여기도 같이 고쳐야 한다"고 알려주는 것이 목적이다.
    expect(avlSeries(candles)).toEqual(vwapSeries(candles));
  });
});
