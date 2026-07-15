import { describe, expect, it } from 'vitest';
import { ema, maSeries, sma } from './indicators.ts';

describe('sma', () => {
  it('마지막 period개의 산술 평균을 낸다', () => {
    // 마지막 3개 = 3,4,5 → 4
    expect(sma([1, 2, 3, 4, 5], 3)).toBe(4);
  });

  it('캔들 수가 period와 같으면 전체 평균', () => {
    expect(sma([2, 4, 6], 3)).toBe(4);
  });

  it('데이터가 부족하면 null', () => {
    expect(sma([1, 2], 3)).toBeNull();
  });

  it('period가 0 이하면 null', () => {
    expect(sma([1, 2, 3], 0)).toBeNull();
    expect(sma([1, 2, 3], -1)).toBeNull();
  });
});

describe('ema', () => {
  it('period와 길이가 같으면 SMA와 동일 (시드값)', () => {
    expect(ema([2, 4, 6], 3)).toBe(4);
  });

  it('알려진 입력에 대해 기대값을 낸다', () => {
    // seed = sma([1,2,3]) = 2, k = 2/4 = 0.5
    // i=3: 4*0.5 + 2*0.5   = 3
    // i=4: 5*0.5 + 3*0.5   = 4
    expect(ema([1, 2, 3, 4, 5], 3)).toBe(4);
  });

  it('최근 값에 더 민감하다 (같은 구간에서 SMA보다 상승분 반영이 크다)', () => {
    const values = [10, 10, 10, 10, 20];
    const emaVal = ema(values, 4)!;
    const smaVal = sma(values, 4)!;
    expect(emaVal).toBeGreaterThan(smaVal);
  });

  it('데이터가 부족하면 null', () => {
    expect(ema([1, 2], 3)).toBeNull();
  });
});

describe('maSeries', () => {
  it('데이터가 부족한 앞 구간은 null', () => {
    expect(maSeries([1, 2, 3, 4], 3, 'SMA')).toEqual([null, null, 2, 3]);
  });

  it('각 시점 값이 전략이 쓰는 movingAverage와 일치한다', () => {
    // 차트 선과 봇 판단이 어긋나면 안 되므로 이 성질이 핵심이다
    const values = [10, 12, 11, 15, 14, 18, 20];
    const series = maSeries(values, 3, 'EMA');
    for (let i = 0; i < values.length; i++) {
      expect(series[i]).toBe(ema(values.slice(0, i + 1), 3));
    }
  });

  it('길이가 입력과 같다', () => {
    expect(maSeries([1, 2, 3, 4, 5], 2, 'SMA')).toHaveLength(5);
  });
});
