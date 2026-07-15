import { describe, expect, it } from 'vitest';
import type { Candle } from '../types.ts';
import { SAR_DEFAULT_MAX_STEP, SAR_DEFAULT_STEP, sarSeries } from './sar.ts';

/**
 * 테스트용 캔들 하나. SAR은 high·low·close만 보므로 나머지 필드는
 * 인덱스에서 기계적으로 채운다.
 */
function candle(i: number, high: number, low: number, close: number): Candle {
  return {
    openTime: i * 60_000,
    open: low,
    high,
    low,
    close,
    volume: 1,
    closeTime: (i + 1) * 60_000 - 1,
  };
}

describe('sarSeries', () => {
  it('상승 추세에서 손 계산과 일치한다 (시드 → 보정 → EP/AF 갱신 → 반전)', () => {
    // step=0.02, maxStep=0.2
    // c0: h=10 l=8  c=9
    // c1: h=12 l=9  c=11  → close 11 >= 9 이므로 상승 추세
    //     시드: sar = min(l0,l1) = 8, ep = max(h0,h1) = 12, af = 0.02 → out[1] = 8
    // c2: h=13 l=10 c=12
    //     nextSar = 8 + 0.02*(12-8) = 8.08
    //     보정(직전 2개 저가): min(8.08, l1=9, l0=8) = 8   ← 보정이 실제로 물린다
    //     반전 없음(l2=10 >= 8). EP 경신(13>12) → ep=13, af=0.04 → out[2] = 8
    // c3: h=14 l=11 c=13
    //     nextSar = 8 + 0.04*(13-8) = 8.2
    //     보정: min(8.2, l2=10, l1=9) = 8.2
    //     반전 없음. EP 경신(14>13) → ep=14, af=0.06 → out[3] = 8.2
    // c4: h=15 l=7  c=8
    //     nextSar = 8.2 + 0.06*(14-8.2) = 8.548
    //     보정: min(8.548, l3=11, l2=10) = 8.548
    //     l4=7 < 8.548 → 반전. sar = 직전 EP = 14, ep = l4 = 7, af = 0.02 → out[4] = 14
    const candles = [
      candle(0, 10, 8, 9),
      candle(1, 12, 9, 11),
      candle(2, 13, 10, 12),
      candle(3, 14, 11, 13),
      candle(4, 15, 7, 8),
    ];
    const series = sarSeries(candles, 0.02, 0.2);
    expect(series[0]).toBeNull(); // 직전 캔들이 없어 시드를 만들 수 없다
    expect(series[1]).toBe(8);
    expect(series[2]).toBeCloseTo(8, 10); // 8.08이 아니다 — 직전 저가로 보정된 값
    expect(series[3]).toBeCloseTo(8.2, 10);
    expect(series[4]).toBeCloseTo(14, 10); // 반전 → 직전 추세의 EP
  });

  it('하락 추세에서 손 계산과 일치한다', () => {
    // c0: h=12 l=8 c=10
    // c1: h=11 l=7 c=9   → close 9 < 10 이므로 하락 추세
    //     시드: sar = max(h0,h1) = 12, ep = min(l0,l1) = 7, af = 0.02 → out[1] = 12
    // c2: h=10 l=6 c=7
    //     nextSar = 12 + 0.02*(7-12) = 11.9
    //     보정(직전 2개 고가): max(11.9, h1=11, h0=12) = 12   ← 보정이 물린다
    //     반전 없음(h2=10 <= 12). EP 경신(6<7) → ep=6, af=0.04 → out[2] = 12
    // c3: h=9 l=5 c=6
    //     nextSar = 12 + 0.04*(6-12) = 11.76
    //     보정: max(11.76, h2=10, h1=11) = 11.76
    //     반전 없음. EP 경신(5<6) → ep=5, af=0.06 → out[3] = 11.76
    // c4: h=13 l=8 c=12
    //     nextSar = 11.76 + 0.06*(5-11.76) = 11.3544
    //     보정: max(11.3544, h3=9, h2=10) = 11.3544
    //     h4=13 > 11.3544 → 반전. sar = 직전 EP = 5, ep = h4 = 13, af = 0.02 → out[4] = 5
    const candles = [
      candle(0, 12, 8, 10),
      candle(1, 11, 7, 9),
      candle(2, 10, 6, 7),
      candle(3, 9, 5, 6),
      candle(4, 13, 8, 12),
    ];
    const series = sarSeries(candles, 0.02, 0.2);
    expect(series[1]).toBe(12);
    expect(series[2]).toBeCloseTo(12, 10); // 11.9가 아니다 — 직전 고가로 보정된 값
    expect(series[3]).toBeCloseTo(11.76, 10);
    expect(series[4]).toBeCloseTo(5, 10); // 반전 → 직전 추세의 EP
  });

  it('AF가 maxStep에서 상한에 걸린다', () => {
    // ⚠️ 이 케이스는 "AF 상한을 빼먹어도 우연히 같은 값"이 나오지 않도록 고른 것이다.
    // step=0.1, maxStep=0.2 — 고가를 매 캔들 경신시켜 AF를 빠르게 상한까지 올린다.
    // c0: h=10 l=8  c=9
    // c1: h=12 l=9  c=11 → 상승. sar = 8, ep = 12, af = 0.1 → out[1] = 8
    // c2: h=14 l=11 c=13
    //     nextSar = 8 + 0.1*(12-8) = 8.4 → 보정 min(8.4, 9, 8) = 8
    //     EP 경신 → ep=14, af=0.2 → out[2] = 8
    // c3: h=16 l=13 c=15
    //     nextSar = 8 + 0.2*(14-8) = 9.2 → 보정 min(9.2, l2=11, l1=9) = 9
    //     EP 경신 → ep=16, af = min(0.2+0.1, 0.2) = 0.2 (상한)  ← 여기서 상한이 물린다
    //     out[3] = 9
    // c4: h=18 l=15 c=17
    //     nextSar = 9 + 0.2*(16-9) = 10.4 → 보정 min(10.4, l3=13, l2=11) = 10.4
    //     out[4] = 10.4
    //     상한이 없었다면 af=0.3 → nextSar = 9 + 0.3*7 = 11.1 → 보정 min(11.1,13,11) = 11
    //     즉 out[4]는 10.4와 11로 갈라지므로 상한을 검증한다.
    const candles = [
      candle(0, 10, 8, 9),
      candle(1, 12, 9, 11),
      candle(2, 14, 11, 13),
      candle(3, 16, 13, 15),
      candle(4, 18, 15, 17),
    ];
    const series = sarSeries(candles, 0.1, 0.2);
    expect(series[1]).toBe(8);
    expect(series[2]).toBeCloseTo(8, 10);
    expect(series[3]).toBeCloseTo(9, 10);
    expect(series[4]).toBeCloseTo(10.4, 10);
    expect(series[4]).not.toBeCloseTo(11, 4); // AF 상한을 빼먹으면 나오는 값
  });

  it('EP를 경신하지 못하면 AF를 올리지 않는다', () => {
    // c0: h=10 l=8 c=9
    // c1: h=12 l=9 c=11 → 상승. sar=8, ep=12, af=0.02 → out[1] = 8
    // c2: h=11 l=10 c=10.5  (고가 11 < ep 12 → 경신 실패)
    //     nextSar = 8 + 0.02*(12-8) = 8.08 → 보정 min(8.08, 9, 8) = 8
    //     반전 없음, EP 경신 없음 → ep=12 유지, af=0.02 유지 → out[2] = 8
    // c3: h=11.5 l=10.5 c=11 (여전히 경신 실패)
    //     nextSar = 8 + 0.02*(12-8) = 8.08  ← af가 0.02 그대로여야 이 값이 나온다
    //     보정: min(8.08, l2=10, l1=9) = 8.08 → out[3] = 8.08
    //     af가 잘못 올라 0.04였다면 8 + 0.04*4 = 8.16이 된다.
    const candles = [
      candle(0, 10, 8, 9),
      candle(1, 12, 9, 11),
      candle(2, 11, 10, 10.5),
      candle(3, 11.5, 10.5, 11),
    ];
    const series = sarSeries(candles, 0.02, 0.2);
    expect(series[2]).toBeCloseTo(8, 10);
    expect(series[3]).toBeCloseTo(8.08, 10);
    expect(series[3]).not.toBeCloseTo(8.16, 4); // EP 경신 없이 AF를 올리면 나오는 값
  });

  it('기본값은 step=0.02, maxStep=0.2이고 인자를 생략하면 그 값을 쓴다', () => {
    expect(SAR_DEFAULT_STEP).toBe(0.02);
    expect(SAR_DEFAULT_MAX_STEP).toBe(0.2);
    const candles = [
      candle(0, 10, 8, 9),
      candle(1, 12, 9, 11),
      candle(2, 13, 10, 12),
      candle(3, 14, 11, 13),
      candle(4, 15, 7, 8),
    ];
    expect(sarSeries(candles)).toEqual(sarSeries(candles, 0.02, 0.2));
  });

  it('상승 추세 동안 SAR은 가격 아래, 하락 추세 동안 위에 머문다', () => {
    // 단조 상승 구간에서는 반전이 없으므로 SAR이 저가를 넘지 않아야 한다.
    const rising = Array.from({ length: 12 }, (_, i) => candle(i, 12 + i, 10 + i, 11 + i));
    for (const [i, v] of sarSeries(rising).entries()) {
      if (v === null) continue;
      expect(v).toBeLessThanOrEqual(rising[i]!.low);
    }
    // 단조 하락 구간에서는 SAR이 고가 아래로 내려오지 않아야 한다.
    const falling = Array.from({ length: 12 }, (_, i) => candle(i, 30 - i, 28 - i, 29 - i));
    for (const [i, v] of sarSeries(falling).entries()) {
      if (v === null) continue;
      expect(v).toBeGreaterThanOrEqual(falling[i]!.high);
    }
  });

  it('가격이 전혀 움직이지 않으면 SAR이 그 값에 고정된다', () => {
    // 고가 = 저가 = 종가. close[1] >= close[0]이라 상승으로 보고
    // sar = ep = 10 → nextSar = 10 + af*(10-10) = 10 이 계속된다. 반전도 없다.
    const flat = Array.from({ length: 5 }, (_, i) => candle(i, 10, 10, 10));
    expect(sarSeries(flat)).toEqual([null, 10, 10, 10, 10]);
  });

  it('캔들이 2개 미만이면 전부 null', () => {
    // 시드에 캔들 2개가 필요하다
    expect(sarSeries([])).toEqual([]);
    expect(sarSeries([candle(0, 10, 8, 9)])).toEqual([null]);
  });

  it('step 또는 maxStep이 0 이하면 전부 null', () => {
    const candles = [candle(0, 10, 8, 9), candle(1, 12, 9, 11), candle(2, 13, 10, 12)];
    expect(sarSeries(candles, 0, 0.2)).toEqual([null, null, null]);
    expect(sarSeries(candles, -0.02, 0.2)).toEqual([null, null, null]);
    expect(sarSeries(candles, 0.02, 0)).toEqual([null, null, null]);
    expect(sarSeries(candles, 0.02, -0.2)).toEqual([null, null, null]);
  });

  it('길이가 입력과 같다', () => {
    const candles = Array.from({ length: 7 }, (_, i) => candle(i, 12 + i, 10 + i, 11 + i));
    expect(sarSeries(candles)).toHaveLength(7);
  });

  it('각 시점 값이 그 시점까지의 캔들만으로 계산된다 (룩어헤드 없음)', () => {
    // 상승·반전·하락·재반전이 섞인 고정 시퀀스 (랜덤 금지 — 실패가 재현돼야 한다)
    const candles = [
      candle(0, 10, 8, 9),
      candle(1, 12, 9, 11),
      candle(2, 13, 10, 12),
      candle(3, 14, 11, 13),
      candle(4, 15, 7, 8),
      candle(5, 9, 5, 6),
      candle(6, 8, 4, 5),
      candle(7, 12, 6, 11),
      candle(8, 15, 10, 14),
      candle(9, 16, 12, 15),
    ];
    const full = sarSeries(candles);
    for (let i = 0; i < candles.length; i++) {
      const partial = sarSeries(candles.slice(0, i + 1));
      expect(partial[i]).toBe(full[i]);
    }
  });
});
