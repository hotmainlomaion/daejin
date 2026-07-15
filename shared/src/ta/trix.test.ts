import { describe, expect, it } from 'vitest';
import { TRIX_PERIOD, trixSeries } from './trix.ts';

describe('trixSeries', () => {
  it('기본 period가 바이낸스 차트와 같은 12다', () => {
    expect(TRIX_PERIOD).toBe(12);
  });

  it('손으로 검산한 알려진 입력에 대해 기대값을 낸다', () => {
    // values = [1, 2, 3, 4, 5], period=2 (k=2/3)
    //
    // EMA1: 시드 sma([1,2]) = 1.5 (idx1)
    //   idx2: (2/3)*3 + (1/3)*1.5 = 2.5
    //   idx3: (2/3)*4 + (1/3)*2.5 = 3.5
    //   idx4: (2/3)*5 + (1/3)*3.5 = 4.5
    //   → [null, 1.5, 2.5, 3.5, 4.5]
    // EMA2 (EMA1의 null 제외한 [1.5, 2.5, 3.5, 4.5]에 EMA(2)):
    //   시드 sma([1.5, 2.5]) = 2 (idx2)
    //   idx3: (2/3)*3.5 + (1/3)*2 = 3
    //   idx4: (2/3)*4.5 + (1/3)*3 = 4
    //   → [null, null, 2, 3, 4]
    // EMA3 ([2, 3, 4]에 EMA(2)):
    //   시드 sma([2, 3]) = 2.5 (idx3)
    //   idx4: (2/3)*4 + (1/3)*2.5 = 3.5
    //   → [null, null, null, 2.5, 3.5]
    // TRIX idx4 = (3.5 - 2.5) / 2.5 * 100 = 40
    // (idx3은 삼중EMA의 첫 값이라 '어제'가 없어 null)
    const series = trixSeries([1, 2, 3, 4, 5], 2);

    expect(series[0]).toBeNull();
    expect(series[1]).toBeNull();
    expect(series[2]).toBeNull();
    expect(series[3]).toBeNull();
    expect(series[4]).toBeCloseTo(40, 10);
  });

  it('TEMA 지표(3·EMA1 - 3·EMA2 + EMA3)가 아니라 삼중 EMA를 쓴다', () => {
    // 두 방식의 답이 갈라지도록 고른 케이스다. 같은 입력([1,2,3,4,5], period=2)에서
    // 위 검산의 EMA1/EMA2/EMA3를 TEMA 공식에 넣으면:
    //   idx3: 3*3.5 - 3*3 + 2.5 = 4
    //   idx4: 3*4.5 - 3*4 + 3.5 = 5
    //   변화율 = (5 - 4) / 4 * 100 = 25
    // TRIX는 삼중 EMA(2.5 → 3.5)의 변화율이라 40이다. 25가 나오면 TEMA를 잘못 쓴 것.
    expect(trixSeries([1, 2, 3, 4, 5], 2)[4]).toBeCloseTo(40, 10);
    expect(trixSeries([1, 2, 3, 4, 5], 2)[4]).not.toBeCloseTo(25, 4);
  });

  it('삼중EMA_어제가 0이면 null (0으로 나누기 방지, Infinity/NaN 금지)', () => {
    // values = [0, 0, 0, 0, 0, 3, 3, 3], period=2 (k=2/3)
    //
    // EMA1: idx1~4 = 0, idx5 = (2/3)*3 = 2, idx6 = (2/3)*3 + (1/3)*2 = 8/3,
    //       idx7 = (2/3)*3 + (1/3)*(8/3) = 26/9
    // EMA2 ([0,0,0,0,2,8/3,26/9]에 EMA(2)): idx2~4 = 0, idx5 = (2/3)*2 = 4/3,
    //       idx6 = (2/3)*(8/3) + (1/3)*(4/3) = 20/9, idx7 = (2/3)*(26/9) + (1/3)*(20/9) = 8/3
    // EMA3 ([0,0,0,4/3,20/9,8/3]에 EMA(2)): idx3 = 0, idx4 = 0,
    //       idx5 = (2/3)*(4/3) = 8/9, idx6 = (2/3)*(20/9) + (1/3)*(8/9) = 16/9,
    //       idx7 = (2/3)*(8/3) + (1/3)*(16/9) = 64/27
    // TRIX idx4: 어제 = 0 → 0으로 나누기 → null
    //      idx5: 어제 = 0 → null
    //      idx6: (16/9 - 8/9) / (8/9) * 100 = 100
    //      idx7: (64/27 - 16/9) / (16/9) * 100 = (16/27)/(16/9)*100 = 33.333...
    const series = trixSeries([0, 0, 0, 0, 0, 3, 3, 3], 2);

    expect(series[4]).toBeNull();
    expect(series[5]).toBeNull();
    // 0으로 나눈 결과가 새어나오지 않는지 (JS는 x/0 = Infinity, 0/0 = NaN)
    for (const v of series) {
      if (v === null) continue;
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(series[6]).toBeCloseTo(100, 10);
    expect(series[7]).toBeCloseTo(100 / 3, 10);
  });

  it('가격이 완전히 평평하면 변화율 0', () => {
    // 삼중EMA도 평평하므로 (x - x)/x = 0. 어제 값이 0이 아니라 계산된다.
    const series = trixSeries([5, 5, 5, 5, 5, 5, 5, 5], 2);
    expect(series[7]).toBe(0);
  });

  it('상승 추세면 양수, 하락 추세면 음수', () => {
    const up = trixSeries([1, 2, 3, 4, 5, 6, 7, 8], 2);
    expect(up[7]!).toBeGreaterThan(0);
    const down = trixSeries([8, 7, 6, 5, 4, 3, 2, 1], 2);
    expect(down[7]!).toBeLessThan(0);
  });

  it('데이터가 부족하면 전부 null (길이는 유지)', () => {
    expect(trixSeries([1, 2, 3], 2)).toEqual([null, null, null]);
    expect(trixSeries([1, 2, 3, 4, 5], TRIX_PERIOD)).toEqual([null, null, null, null, null]);
    expect(trixSeries([], 12)).toEqual([]);
  });

  it('period가 0 이하면 전부 null', () => {
    expect(trixSeries([1, 2, 3, 4, 5], 0)).toEqual([null, null, null, null, null]);
    expect(trixSeries([1, 2, 3, 4, 5], -1)).toEqual([null, null, null, null, null]);
  });

  it('길이가 입력과 같다', () => {
    expect(trixSeries([1, 2, 3, 4, 5, 6, 7], 2)).toHaveLength(7);
  });

  it('룩어헤드가 없다 (각 시점 값이 그 시점까지만으로 계산한 값과 같다)', () => {
    const values = [
      44, 44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03,
    ];
    const series = trixSeries(values, 2);
    for (let i = 0; i < values.length; i++) {
      expect(series[i]).toBe(trixSeries(values.slice(0, i + 1), 2)[i]);
    }
  });
});
