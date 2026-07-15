import { describe, expect, it } from 'vitest';
import {
  BOLLINGER_DEFAULT_PERIOD,
  BOLLINGER_DEFAULT_STDDEV_MULT,
  bollingerBands,
  bollingerSeries,
} from './bollinger.ts';

describe('bollingerBands', () => {
  it('알려진 입력에 대해 기대값을 낸다', () => {
    // period=8, mult=2, values=[2,4,4,4,5,5,7,9]
    // 중심선 = 평균 = 40/8 = 5
    // 편차:      -3,-1,-1,-1, 0, 0, 2, 4
    // 편차제곱:    9, 1, 1, 1, 0, 0, 4,16 → 합 32
    // 모집단 분산 = 32/8 = 4 → 표준편차 = 2
    // 상단 = 5 + 2*2 = 9, 하단 = 5 - 2*2 = 1
    const band = bollingerBands([2, 4, 4, 4, 5, 5, 7, 9], 8, 2)!;
    expect(band.middle).toBe(5);
    expect(band.upper).toBe(9);
    expect(band.lower).toBe(1);
  });

  it('표본(n-1)이 아니라 모집단(n) 표준편차를 쓴다', () => {
    // ⚠️ 이 케이스는 두 방식의 답이 갈라지도록 고른 것이다.
    // 위와 같은 입력에서 표본 표준편차였다면
    //   sqrt(32/7) = 2.13809... → 상단 9.27618, 하단 0.72382 가 나온다.
    // 바이낸스·TradingView는 모집단(n)을 쓰므로 표본 값이 나오면 화면과 어긋난다.
    const band = bollingerBands([2, 4, 4, 4, 5, 5, 7, 9], 8, 2)!;
    expect(band.upper).toBeCloseTo(9, 10);
    expect(band.upper).not.toBeCloseTo(9.2761798, 4);
    expect(band.lower).not.toBeCloseTo(0.7238202, 4);
  });

  it('마지막 period개만 본다', () => {
    // period=8이므로 앞의 [100, 200]은 무시되고 위 케이스와 같은 값이 나와야 한다
    const band = bollingerBands([100, 200, 2, 4, 4, 4, 5, 5, 7, 9], 8, 2)!;
    expect(band.middle).toBe(5);
    expect(band.upper).toBe(9);
    expect(band.lower).toBe(1);
  });

  it('배수(stdDevMult)가 상/하단 폭에 선형으로 반영된다', () => {
    // 표준편차 2 → mult=1이면 상단 7/하단 3, mult=3이면 상단 11/하단 -1
    const one = bollingerBands([2, 4, 4, 4, 5, 5, 7, 9], 8, 1)!;
    expect(one.upper).toBe(7);
    expect(one.lower).toBe(3);

    const three = bollingerBands([2, 4, 4, 4, 5, 5, 7, 9], 8, 3)!;
    expect(three.upper).toBe(11);
    expect(three.lower).toBe(-1);
  });

  it('변동성이 0이면 (전부 같은 값) 세 선이 정확히 겹친다', () => {
    // 표준편차 = 0 → 상단 = 중심선 = 하단. 스퀴즈의 극단이지 오류가 아니다.
    const band = bollingerBands([10, 10, 10, 10], 4, 2)!;
    expect(band.upper).toBe(10);
    expect(band.middle).toBe(10);
    expect(band.lower).toBe(10);
  });

  it('mult=0이면 세 선이 겹친다', () => {
    const band = bollingerBands([2, 4, 4, 4, 5, 5, 7, 9], 8, 0)!;
    expect(band.upper).toBe(5);
    expect(band.middle).toBe(5);
    expect(band.lower).toBe(5);
  });

  it('기본값은 period=20, stdDevMult=2', () => {
    expect(BOLLINGER_DEFAULT_PERIOD).toBe(20);
    expect(BOLLINGER_DEFAULT_STDDEV_MULT).toBe(2);
    // 인자를 생략하면 기본값을 쓴다 (20개 미만이면 null)
    const values = Array.from({ length: 20 }, () => 10);
    expect(bollingerBands(values)).toEqual({ upper: 10, middle: 10, lower: 10 });
    expect(bollingerBands(values.slice(0, 19))).toBeNull();
  });

  it('데이터가 부족하면 null', () => {
    expect(bollingerBands([1, 2], 3, 2)).toBeNull();
    expect(bollingerBands([], 1, 2)).toBeNull();
    // 딱 period개면 계산된다
    expect(bollingerBands([1, 2, 3], 3, 2)).not.toBeNull();
  });

  it('period가 0 이하면 null', () => {
    expect(bollingerBands([1, 2, 3], 0, 2)).toBeNull();
    expect(bollingerBands([1, 2, 3], -1, 2)).toBeNull();
  });

  it('항상 하단 <= 중심선 <= 상단', () => {
    // 상승·하락·횡보가 섞인 고정 시퀀스 (랜덤 금지 — 실패가 재현돼야 한다)
    const values = [
      44, 44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61,
      46.28, 46.28, 46, 46.03, 46.41, 46.22, 45.64, 46.21, 46.25, 45.71,
    ];
    for (const period of [2, 5, 20]) {
      for (const point of bollingerSeries(values, period, 2)) {
        if (point.middle === null) continue;
        expect(point.lower!).toBeLessThanOrEqual(point.middle);
        expect(point.middle).toBeLessThanOrEqual(point.upper!);
      }
    }
  });
});

describe('bollingerSeries', () => {
  it('데이터가 부족한 앞 구간은 세 필드가 전부 null', () => {
    // period=3, values=[2,4,6,8]
    // i=0,1: 데이터 부족 → null
    // i=2: 평균 = 4, 편차 -2,0,2 → 분산 8/3 → sd = 1.63299...
    // i=3: 마지막 3개 4,6,8 → 평균 6, sd 동일 1.63299...
    const series = bollingerSeries([2, 4, 6, 8], 3, 2);
    expect(series[0]).toEqual({ upper: null, middle: null, lower: null });
    expect(series[1]).toEqual({ upper: null, middle: null, lower: null });
    expect(series[2]!.middle).toBe(4);
    expect(series[2]!.upper).toBeCloseTo(4 + 2 * Math.sqrt(8 / 3), 10);
    expect(series[3]!.middle).toBe(6);
    expect(series[3]!.lower).toBeCloseTo(6 - 2 * Math.sqrt(8 / 3), 10);
  });

  it('길이가 입력과 같다', () => {
    expect(bollingerSeries([1, 2, 3, 4, 5], 2, 2)).toHaveLength(5);
    // 데이터가 부족해도 길이는 유지한다
    expect(bollingerSeries([1, 2, 3], 20, 2)).toHaveLength(3);
  });

  it('period가 0 이하면 전부 null', () => {
    expect(bollingerSeries([1, 2, 3], 0, 2)).toEqual([
      { upper: null, middle: null, lower: null },
      { upper: null, middle: null, lower: null },
      { upper: null, middle: null, lower: null },
    ]);
  });

  it('마지막 값이 bollingerBands()와 정확히 일치한다 (차트 선 == 단일 값)', () => {
    const values = [10, 12, 11, 15, 14, 18, 20, 19, 17, 21];
    for (const period of [2, 3, 5]) {
      const series = bollingerSeries(values, period, 2);
      expect(series[series.length - 1]).toEqual(bollingerBands(values, period, 2));
    }
  });

  it('각 시점 값이 그 시점까지의 bollingerBands()와 일치한다 (룩어헤드 없음)', () => {
    const values = [10, 12, 11, 15, 14, 18, 20, 19, 17, 21];
    const series = bollingerSeries(values, 3, 2);
    for (let i = 0; i < values.length; i++) {
      const expected = bollingerBands(values.slice(0, i + 1), 3, 2) ?? {
        upper: null,
        middle: null,
        lower: null,
      };
      expect(series[i]).toEqual(expected);
    }
  });
});
