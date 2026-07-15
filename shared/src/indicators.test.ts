import { describe, expect, it } from 'vitest';
import { ema, sma } from './indicators.ts';

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
