import { describe, expect, it } from 'vitest';
import { DMI_DEFAULT_PERIOD, dmiSeries } from './dmi.ts';
import type { Candle } from '../types.ts';

/** 테스트용 캔들. DMI는 high/low/close만 본다. */
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

describe('dmiSeries', () => {
  // 손계산 픽스처 (period=2).
  //
  // 캔들:  idx0 고10/저8/종9   idx1 고12/저9/종11    idx2 고13/저11/종12
  //        idx3 고12/저10/종10.5                     idx4 고11/저9/종9.5
  //
  // idx1: upMove = 12−10 = 2, downMove = 8−9 = −1 → +DM = 2, −DM = 0
  //       TR = max(12−9=3, |12−9|=3, |9−9|=0) = 3
  // idx2: upMove = 13−12 = 1, downMove = 9−11 = −2 → +DM = 1, −DM = 0
  //       TR = max(13−11=2, |13−11|=2, |11−11|=0) = 2
  // idx3: upMove = 12−13 = −1, downMove = 11−10 = 1 → +DM = 0, −DM = 1
  //       TR = max(12−10=2, |12−12|=0, |10−12|=2) = 2
  // idx4: upMove = 11−12 = −1, downMove = 10−9 = 1 → +DM = 0, −DM = 1
  //       TR = max(11−9=2, |11−10.5|=0.5, |9−10.5|=1.5) = 2
  const handChecked: Candle[] = [
    candle(10, 8, 9),
    candle(12, 9, 11),
    candle(13, 11, 12),
    candle(12, 10, 10.5),
    candle(11, 9, 9.5),
  ];

  it('Wilder 평활을 거친 알려진 입력에 대해 +DI/−DI 기대값을 낸다', () => {
    // 시드(idx1..idx2의 단순 평균): 평활(+DM) = (2+1)/2 = 1.5, 평활(−DM) = 0, 평활(TR) = (3+2)/2 = 2.5
    // idx2: +DI = 100×1.5/2.5 = 60, −DI = 0
    //       DX = 100×|60−0|/(60+0) = 100
    //
    // idx3 Wilder 갱신 (avg = (이전 avg × (period−1) + 현재값)/period, period=2):
    //       평활(+DM) = (1.5×1 + 0)/2 = 0.75
    //       평활(−DM) = (0×1 + 1)/2   = 0.5
    //       평활(TR)  = (2.5×1 + 2)/2 = 2.25
    //       +DI = 100×0.75/2.25 = 33.3333, −DI = 100×0.5/2.25 = 22.2222
    //       DX  = 100×|33.3333−22.2222|/55.5556 = 20
    const series = dmiSeries(handChecked, 2);
    expect(series[2]!.plusDi).toBeCloseTo(60, 10);
    expect(series[2]!.minusDi).toBeCloseTo(0, 10);
    expect(series[3]!.plusDi).toBeCloseTo(33.3333, 4);
    expect(series[3]!.minusDi).toBeCloseTo(22.2222, 4);

    // idx4: 평활(+DM) = (0.75×1 + 0)/2 = 0.375
    //       평활(−DM) = (0.5×1 + 1)/2  = 0.75
    //       평활(TR)  = (2.25×1 + 2)/2 = 2.125
    //       +DI = 100×0.375/2.125 = 17.6471, −DI = 100×0.75/2.125 = 35.2941
    expect(series[4]!.plusDi).toBeCloseTo(17.6471, 4);
    expect(series[4]!.minusDi).toBeCloseTo(35.2941, 4);
  });

  it('ADX는 DX를 다시 Wilder 평활한 값이다', () => {
    // DX: idx2 = 100, idx3 = 20, idx4 = 33.3333
    // ADX 시드(DX가 period=2개 모이는 idx3) = (100 + 20)/2 = 60
    // idx4: ADX = (60×1 + 33.3333)/2 = 46.6667
    const series = dmiSeries(handChecked, 2);
    expect(series[2]!.adx).toBeNull(); // DX가 1개뿐이라 아직 시드가 안 찬다
    expect(series[3]!.adx).toBeCloseTo(60, 10);
    expect(series[4]!.adx).toBeCloseTo(46.6667, 4);
  });

  it('단순 평균이 아니라 Wilder 평활을 쓴다', () => {
    // ⚠️ 이 케이스는 두 방식의 답이 갈라지도록 고른 것이다. 우연히 같은 값이 나오는
    //    입력을 골랐다면 평활 방식을 아예 검증하지 못한다.
    //
    // idx3 시점, 최근 period(=2)개의 값은 +DM = [1, 0], −DM = [0, 1], TR = [2, 2] 이다.
    //  - 단순 평균이었다면 평활(+DM) = 0.5, 평활(−DM) = 0.5, 평활(TR) = 2
    //    → +DI = −DI = 25 이고 **DX = 0** (방향성 없음)이 나온다.
    //  - Wilder면 시드(+DM = 1.5)의 꼬리가 남아 +DI = 33.3333 ≠ −DI = 22.2222,
    //    → DX = 20 으로 여전히 상승 우세로 읽힌다.
    // 두 방식이 "상승 우세"와 "방향 없음"으로 정반대 해석을 내므로 반드시 갈라진다.
    const series = dmiSeries(handChecked, 2);
    expect(series[3]!.plusDi).toBeCloseTo(33.3333, 4);
    expect(series[3]!.plusDi).not.toBeCloseTo(25, 1);
    expect(series[3]!.minusDi).toBeCloseTo(22.2222, 4);
    expect(series[3]!.minusDi).not.toBeCloseTo(25, 1);
    // 단순 평균이었다면 두 DI가 같아 DX = 0 → ADX 시드도 (100+0)/2 = 50 이 됐을 것이다
    expect(series[3]!.plusDi).not.toBeCloseTo(series[3]!.minusDi!, 1);
    expect(series[3]!.adx).toBeCloseTo(60, 10);
    expect(series[3]!.adx).not.toBeCloseTo(50, 1);
  });

  it('+DM과 −DM은 동시에 인정되지 않는다', () => {
    // idx1은 고가가 2 올랐고 저가도 1 올랐다 → 상승 방향만 인정 (+DM=2, −DM=0)
    // 두 방향을 모두 인정하는 구현이었다면 −DI가 0이 아니었을 것이다.
    expect(dmiSeries(handChecked, 2)[2]!.minusDi).toBe(0);

    // 고가·저가가 양쪽으로 같은 폭만큼 벌어진 캔들(outside bar)은 어느 쪽도 우세하지 않다
    const outside = [candle(10, 8, 9), candle(11, 7, 9), candle(11, 7, 9)];
    const series = dmiSeries(outside, 2);
    expect(series[2]!.plusDi).toBe(0);
    expect(series[2]!.minusDi).toBe(0);
  });

  it('전 구간 상승이면 +DI가 −DI보다 크고, 하락이면 반대다', () => {
    const up = [
      candle(10, 8, 9),
      candle(11, 9, 10),
      candle(12, 10, 11),
      candle(13, 11, 12),
      candle(14, 12, 13),
    ];
    const upSeries = dmiSeries(up, 2);
    expect(upSeries[4]!.plusDi!).toBeGreaterThan(upSeries[4]!.minusDi!);

    const down = [
      candle(14, 12, 13),
      candle(13, 11, 12),
      candle(12, 10, 11),
      candle(11, 9, 10),
      candle(10, 8, 9),
    ];
    const downSeries = dmiSeries(down, 2);
    expect(downSeries[4]!.minusDi!).toBeGreaterThan(downSeries[4]!.plusDi!);
  });

  it('평활(TR)이 0이면 +DI/−DI/ADX 모두 0 (0으로 나누기 방지)', () => {
    // 완전히 같은 캔들만 있으면 TR = 0, +DM = −DM = 0 이라 식이 0/0으로 정의되지 않는다.
    // 움직임이 없으니 방향의 힘도 없다 → 0. (DX도 (+DI + −DI) = 0이라 0/0 → 0)
    const flat = [
      candle(10, 10, 10),
      candle(10, 10, 10),
      candle(10, 10, 10),
      candle(10, 10, 10),
      candle(10, 10, 10),
    ];
    const series = dmiSeries(flat, 2);
    expect(series[2]).toEqual({ plusDi: 0, minusDi: 0, adx: null });
    expect(series[3]).toEqual({ plusDi: 0, minusDi: 0, adx: 0 });
    expect(series[4]).toEqual({ plusDi: 0, minusDi: 0, adx: 0 });
    // NaN/Infinity가 새지 않는다
    for (const v of series) {
      if (v.plusDi === null) continue;
      expect(Number.isFinite(v.plusDi)).toBe(true);
      expect(Number.isFinite(v.minusDi!)).toBe(true);
    }
  });

  it('(+DI + −DI)가 0이면 DX를 0으로 둔다 (0으로 나누기 방지)', () => {
    // 가격은 움직이지만(TR > 0) 고가·저가가 제자리인 캔들 → +DM = −DM = 0 → 두 DI가 0.
    // TR은 0이 아니라서 위 케이스와는 다른 경로로 DX가 0/0이 된다.
    const noDirection = [
      candle(12, 8, 9),
      candle(12, 8, 11),
      candle(12, 8, 9),
      candle(12, 8, 11),
      candle(12, 8, 9),
    ];
    const series = dmiSeries(noDirection, 2);
    expect(series[2]!.plusDi).toBe(0);
    expect(series[2]!.minusDi).toBe(0);
    // DX가 전부 0이므로 ADX도 0 — 100 쪽으로 뒀다면 횡보인데 강한 추세라고 거짓말을 한다
    expect(series[3]!.adx).toBe(0);
    expect(series[4]!.adx).toBe(0);
  });

  it('데이터가 부족한 앞 구간은 null', () => {
    // period=2면 +DI/−DI는 인덱스 2(= period)부터, ADX는 인덱스 3(= 2×period−1)부터
    const series = dmiSeries(handChecked, 2);
    expect(series[0]).toEqual({ plusDi: null, minusDi: null, adx: null });
    expect(series[1]).toEqual({ plusDi: null, minusDi: null, adx: null });
    expect(series[2]!.plusDi).not.toBeNull();
    expect(series[2]!.adx).toBeNull();
    expect(series[3]!.adx).not.toBeNull();
  });

  it('ADX는 인덱스 2 × period − 1 에서 처음 나온다', () => {
    for (const period of [2, 3, 5]) {
      const series = dmiSeries(fixtureCandles, period);
      for (let i = 0; i < 2 * period - 1; i++) {
        expect(series[i]!.adx).toBeNull();
      }
      expect(series[2 * period - 1]!.adx).not.toBeNull();
    }
  });

  it('캔들 수가 period + 1 미만이면 전부 null', () => {
    // 변화량이 period개 모여야 시드를 만들 수 있다 (rsi.ts와 같은 규약)
    expect(dmiSeries([candle(10, 8, 9), candle(11, 9, 10)], 2)).toEqual([
      { plusDi: null, minusDi: null, adx: null },
      { plusDi: null, minusDi: null, adx: null },
    ]);
    expect(dmiSeries([], 14)).toEqual([]);
    // 딱 period+1개면 +DI/−DI가 나온다 (ADX는 아직 없다)
    const exact = dmiSeries(handChecked.slice(0, 3), 2);
    expect(exact[2]!.plusDi).not.toBeNull();
    expect(exact[2]!.adx).toBeNull();
  });

  it('period가 0 이하면 전부 null', () => {
    const allNull = handChecked.map(() => ({ plusDi: null, minusDi: null, adx: null }));
    expect(dmiSeries(handChecked, 0)).toEqual(allNull);
    expect(dmiSeries(handChecked, -1)).toEqual(allNull);
  });

  it('길이가 입력과 같다', () => {
    expect(dmiSeries(fixtureCandles, 5)).toHaveLength(fixtureCandles.length);
    // 데이터가 부족해도 길이는 유지한다
    expect(dmiSeries(fixtureCandles.slice(0, 3), 14)).toHaveLength(3);
  });

  it('각 시점 값이 그 시점까지의 캔들만으로 계산한 값과 같다 (룩어헤드 없음)', () => {
    const series = dmiSeries(fixtureCandles, 3);
    for (let i = 0; i < fixtureCandles.length; i++) {
      const prefix = dmiSeries(fixtureCandles.slice(0, i + 1), 3);
      expect(series[i]).toEqual(prefix[i]);
    }
  });

  it('+DI/−DI/ADX는 항상 0~100 범위 안에 있다', () => {
    for (const period of [2, 3, 5, 14]) {
      for (const v of dmiSeries(fixtureCandles, period)) {
        if (v.plusDi === null) continue;
        expect(v.plusDi).toBeGreaterThanOrEqual(0);
        expect(v.plusDi).toBeLessThanOrEqual(100);
        expect(v.minusDi!).toBeGreaterThanOrEqual(0);
        expect(v.minusDi!).toBeLessThanOrEqual(100);
        if (v.adx === null) continue;
        expect(v.adx).toBeGreaterThanOrEqual(0);
        expect(v.adx).toBeLessThanOrEqual(100);
      }
    }
  });

  it('기본 period는 14다', () => {
    expect(DMI_DEFAULT_PERIOD).toBe(14);
    expect(dmiSeries(fixtureCandles)).toEqual(dmiSeries(fixtureCandles, 14));
  });
});
