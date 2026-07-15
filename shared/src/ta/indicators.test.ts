import { describe, expect, it } from 'vitest';
import { ema, maSeries, rsi, rsiSeries, sma } from './index.ts';

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

describe('rsi', () => {
  it('Wilder 평활을 거친 알려진 입력에 대해 기대값을 낸다', () => {
    // period=2, values=[1,2,3,2]
    // 변화량: +1, +1, -1
    // 시드(처음 2개): avgGain = (1+1)/2 = 1, avgLoss = 0
    // 마지막(-1): avgGain = (1*1 + 0)/2 = 0.5, avgLoss = (0*1 + 1)/2 = 0.5
    // RS = 1 → RSI = 100 - 100/2 = 50
    expect(rsi([1, 2, 3, 2], 2)).toBe(50);
  });

  it('단순 평균이 아니라 Wilder 평활을 쓴다', () => {
    // 이 케이스는 두 방식의 답이 갈라지도록 고른 것이다. TradingView·바이낸스가
    // Wilder를 쓰므로 여기서 단순 평균 값이 나오면 화면과 어긋난다.
    //
    // period=3, values=[10,11,12,13,12,12.5] / 변화량: +1, +1, +1, -1, +0.5
    // 시드(처음 3개): avgGain = 3/3 = 1, avgLoss = 0
    // i=4(-1):   avgGain = (1*2 + 0)/3 = 2/3,        avgLoss = (0*2 + 1)/3 = 1/3
    // i=5(+0.5): avgGain = (2/3*2 + 0.5)/3 = 0.61111, avgLoss = (1/3*2 + 0)/3 = 0.22222
    // RS = 2.75 → RSI = 100 - 100/3.75 = 73.333...
    //
    // 단순 평균이었다면 최근 3개 변화량(+1,-1,+0.5)만 보고
    // avgGain = 0.5, avgLoss = 1/3 → RS = 1.5 → RSI = 60 이 나온다.
    expect(rsi([10, 11, 12, 13, 12, 12.5], 3)).toBeCloseTo(73.3333, 4);
    expect(rsi([10, 11, 12, 13, 12, 12.5], 3)).not.toBeCloseTo(60, 4);
  });

  it('전 구간 단조 상승이면 100 (avgLoss = 0, 0으로 나누기 방지)', () => {
    // 하락분이 없어 RS가 발산한다 → 극한값 100
    expect(rsi([1, 2, 3, 4, 5], 2)).toBe(100);
    expect(rsi([100, 101, 105, 110, 111, 120], 3)).toBe(100);
  });

  it('전 구간 단조 하락이면 0', () => {
    // avgGain = 0 → RS = 0 → RSI = 0
    expect(rsi([5, 4, 3, 2, 1], 2)).toBe(0);
  });

  it('가격 변화가 전혀 없으면 50 (관례상 중립)', () => {
    // avgGain = avgLoss = 0 이라 RS가 0/0으로 정의되지 않는다 → 중립 50
    expect(rsi([10, 10, 10, 10, 10], 3)).toBe(50);
  });

  it('데이터가 부족하면 null (period + 1 미만)', () => {
    // 변화량이 period개 모여야 시드를 만들 수 있다
    expect(rsi([1, 2, 3], 3)).toBeNull();
    expect(rsi([1, 2], 2)).toBeNull();
    expect(rsi([], 14)).toBeNull();
    // 딱 period+1개면 계산된다
    expect(rsi([1, 2, 3, 4], 3)).not.toBeNull();
  });

  it('period가 0 이하면 null', () => {
    expect(rsi([1, 2, 3, 4, 5], 0)).toBeNull();
    expect(rsi([1, 2, 3, 4, 5], -1)).toBeNull();
  });

  it('항상 0~100 범위 안에 있다', () => {
    // 상승·하락·횡보가 섞인 고정 시퀀스 (랜덤 금지 — 실패가 재현돼야 한다)
    const values = [
      44, 44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61,
      46.28, 46.28, 46, 46.03, 46.41, 46.22, 45.64, 46.21, 46.25, 45.71, 46.45, 45.78, 45.35, 44.03,
      44.18, 44.22, 44.57, 43.42, 42.66, 43.13,
    ];
    for (const period of [2, 5, 14]) {
      for (const v of rsiSeries(values, period)) {
        if (v === null) continue;
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('rsiSeries', () => {
  it('데이터가 부족한 앞 구간은 null', () => {
    // period=2면 인덱스 0,1은 변화량이 2개 모이지 않아 null
    const series = rsiSeries([1, 2, 3, 2], 2);
    expect(series[0]).toBeNull();
    expect(series[1]).toBeNull();
    expect(series[2]).toBe(100); // 변화량 +1,+1 → avgLoss=0
    expect(series[3]).toBe(50);
  });

  it('길이가 입력과 같다', () => {
    expect(rsiSeries([1, 2, 3, 4, 5], 2)).toHaveLength(5);
    // 데이터가 부족해도 길이는 유지하고 전부 null
    expect(rsiSeries([1, 2, 3], 14)).toEqual([null, null, null]);
  });

  it('period가 0 이하면 전부 null', () => {
    expect(rsiSeries([1, 2, 3], 0)).toEqual([null, null, null]);
  });

  it('마지막 값이 rsi()와 정확히 일치한다 (차트 선 == 봇 판단)', () => {
    // 차트 보조지표 패인의 값과 전략이 쓰는 값이 어긋나면 안 되므로 이 성질이 핵심이다
    const values = [10, 12, 11, 15, 14, 18, 20, 19, 17, 21, 22, 20, 23, 25, 24, 26];
    for (const period of [2, 3, 5, 14]) {
      const series = rsiSeries(values, period);
      expect(series[series.length - 1]).toBe(rsi(values, period));
    }
  });

  it('각 시점 값이 그 시점까지의 rsi()와 일치한다', () => {
    // 시리즈가 미래 캔들을 보지 않는다는 것(룩어헤드 없음)을 고정한다
    const values = [44, 44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42];
    const series = rsiSeries(values, 3);
    for (let i = 0; i < values.length; i++) {
      expect(series[i]).toBe(rsi(values.slice(0, i + 1), 3));
    }
  });
});
