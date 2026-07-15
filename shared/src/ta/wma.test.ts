import { describe, expect, it } from 'vitest';
import { sma } from './moving-averages.ts';
import { wma, wmaSeries } from './wma.ts';

describe('wma', () => {
  it('선형 가중치를 적용한 알려진 입력에 대해 기대값을 낸다', () => {
    // period=3, values=[1,2,3]
    // 가중치: 가장 오래된 1 → 1, 2 → 2, 가장 최근 3 → 3
    // 분자 = 1*1 + 2*2 + 3*3 = 14, 분모 = 3*4/2 = 6
    // → 14/6 = 2.3333...
    expect(wma([1, 2, 3], 3)).toBeCloseTo(14 / 6, 10);
  });

  it('SMA·EMA와 답이 갈라지는 입력에서 WMA 값을 낸다', () => {
    // ⚠️ 이 케이스는 "다른 방식으로 계산해도 우연히 같은 값"을 피하려고 고른 것이다.
    // [1,2,3,4,5] / period=3 은 기존 indicators.test.ts에서 SMA도 EMA도 4를 내는
    // 입력이다 (sma: (3+4+5)/3 = 4, ema: 시드 2 → 3 → 4).
    // WMA는 최근 값 가중이 더 커서 4가 아니어야 한다:
    //   마지막 3개 = 3,4,5 → (3*1 + 4*2 + 5*3)/6 = (3+8+15)/6 = 26/6 = 4.3333...
    expect(wma([1, 2, 3, 4, 5], 3)).toBeCloseTo(26 / 6, 10);
    // SMA와 같은 값이 나오면 WMA를 검증하지 못한 것이므로 명시적으로 고정한다
    expect(wma([1, 2, 3, 4, 5], 3)).not.toBeCloseTo(4, 6);
    expect(sma([1, 2, 3, 4, 5], 3)).toBe(4);
  });

  it('창(window) 밖의 값은 전혀 반영하지 않는다 (EMA와 다른 점)', () => {
    // 앞쪽 값만 바꿔도 마지막 3개가 같으면 WMA는 같다.
    // EMA였다면 시드가 달라져 값이 달라진다.
    expect(wma([100, 200, 3, 4, 5], 3)).toBe(wma([1, 2, 3, 4, 5], 3));
  });

  it('최근 값에 더 민감하다 (같은 구간에서 SMA보다 상승분 반영이 크다)', () => {
    const values = [10, 10, 10, 10, 20];
    expect(wma(values, 4)!).toBeGreaterThan(sma(values, 4)!);
  });

  it('period=1이면 마지막 값 그대로', () => {
    // 분자 = 5*1 = 5, 분모 = 1*2/2 = 1
    expect(wma([1, 2, 3, 4, 5], 1)).toBe(5);
  });

  it('전부 같은 값이면 그 값 (가중치 합이 분모와 맞는지 확인)', () => {
    // 분자 = 5*1 + 5*2 + 5*3 = 30, 분모 = 6 → 5
    // 분모를 잘못 잡으면 여기서 즉시 어긋난다
    expect(wma([5, 5, 5], 3)).toBe(5);
  });

  it('캔들 수가 period와 같으면 전체를 가중 평균', () => {
    // (2*1 + 4*2 + 6*3)/6 = (2+8+18)/6 = 28/6 = 4.6666...
    expect(wma([2, 4, 6], 3)).toBeCloseTo(28 / 6, 10);
  });

  it('데이터가 부족하면 null', () => {
    expect(wma([1, 2], 3)).toBeNull();
    expect(wma([], 1)).toBeNull();
  });

  it('period가 0 이하면 null', () => {
    expect(wma([1, 2, 3], 0)).toBeNull();
    expect(wma([1, 2, 3], -1)).toBeNull();
  });
});

describe('wmaSeries', () => {
  it('데이터가 부족한 앞 구간은 null이고 각 시점 값이 손 계산과 맞는다', () => {
    // period=2, 분모 = 2*3/2 = 3
    // i=0: 데이터 부족 → null
    // i=1: (1*1 + 2*2)/3 = 5/3
    // i=2: (2*1 + 3*2)/3 = 8/3
    // i=3: (3*1 + 4*2)/3 = 11/3
    const series = wmaSeries([1, 2, 3, 4], 2);
    expect(series[0]).toBeNull();
    expect(series[1]).toBeCloseTo(5 / 3, 10);
    expect(series[2]).toBeCloseTo(8 / 3, 10);
    expect(series[3]).toBeCloseTo(11 / 3, 10);
  });

  it('길이가 입력과 같다', () => {
    expect(wmaSeries([1, 2, 3, 4, 5], 2)).toHaveLength(5);
    // 데이터가 부족해도 길이는 유지하고 전부 null
    expect(wmaSeries([1, 2, 3], 20)).toEqual([null, null, null]);
  });

  it('period가 0 이하면 전부 null', () => {
    expect(wmaSeries([1, 2, 3], 0)).toEqual([null, null, null]);
  });

  it('마지막 값이 wma()와 정확히 일치한다', () => {
    const values = [10, 12, 11, 15, 14, 18, 20];
    for (const period of [1, 2, 3, 5]) {
      const series = wmaSeries(values, period);
      expect(series[series.length - 1]).toBe(wma(values, period));
    }
  });

  it('각 시점 값이 그 시점까지의 wma()와 일치한다 (룩어헤드 없음)', () => {
    const values = [10, 12, 11, 15, 14, 18, 20];
    const series = wmaSeries(values, 3);
    for (let i = 0; i < values.length; i++) {
      expect(series[i]).toBe(wma(values.slice(0, i + 1), 3));
    }
  });
});
