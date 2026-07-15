import { describe, expect, it } from 'vitest';
import { EMV_DEFAULT_PERIOD, EMV_VOLUME_SCALE, emvSeries, obvSeries } from './volume.ts';
import type { Candle } from '../types.ts';

/** 테스트용 캔들. */
function candle(high: number, low: number, close: number, volume: number): Candle {
  return { openTime: 0, open: close, high, low, close, volume, closeTime: 0 };
}

/** 상승·하락·횡보가 섞인 고정 시퀀스 (랜덤 금지 — 실패가 재현돼야 한다). */
const fixtureCandles: Candle[] = [
  candle(45.0, 44.0, 44.5, 1200),
  candle(45.5, 44.2, 45.3, 1500),
  candle(46.0, 45.1, 45.2, 900),
  candle(45.6, 44.0, 44.1, 2100),
  candle(44.8, 43.2, 44.6, 1800),
  candle(46.2, 44.5, 46.0, 2400),
  candle(47.0, 45.8, 46.1, 1100),
  candle(46.5, 45.0, 45.1, 1700),
  candle(45.4, 43.9, 44.0, 2000),
  candle(44.6, 43.0, 43.2, 2600),
  candle(45.0, 43.1, 44.9, 1900),
  candle(46.8, 44.7, 46.7, 3000),
];

describe('obvSeries', () => {
  it('알려진 입력에 대해 기대값을 낸다', () => {
    // 종가 10 → 11(상승, +50) → 11(보합, 변화 없음) → 9(하락, −200) → 12(상승, +300)
    // 누적:      0  →  50      →  50               →  −150            →  150
    const candles = [
      candle(10, 9, 10, 100),
      candle(12, 10, 11, 50),
      candle(12, 10, 11, 70),
      candle(11, 9, 9, 200),
      candle(13, 9, 12, 300),
    ];
    expect(obvSeries(candles)).toEqual([0, 50, 50, -150, 150]);
  });

  it('첫 캔들은 기준점 0이다', () => {
    // 첫 거래량으로 시드하는 구현이었다면 999가 나왔을 것이다.
    // OBV는 절대 수준이 아니라 차이만 의미가 있으므로 0에서 출발한다 (volume.ts 주석 참조).
    expect(obvSeries([candle(10, 9, 10, 999)])).toEqual([0]);
    expect(obvSeries(fixtureCandles)[0]).toBe(0);
  });

  it('종가가 같으면 거래량을 더하지도 빼지도 않는다', () => {
    const candles = [candle(10, 9, 10, 100), candle(10, 9, 10, 500), candle(10, 9, 10, 700)];
    expect(obvSeries(candles)).toEqual([0, 0, 0]);
  });

  it('전 구간 상승이면 첫 캔들을 뺀 거래량의 합', () => {
    const candles = [
      candle(10, 9, 10, 100),
      candle(11, 10, 11, 200),
      candle(12, 11, 12, 300),
    ];
    expect(obvSeries(candles)).toEqual([0, 200, 500]);
  });

  it('전 구간 하락이면 부호가 반대다', () => {
    const candles = [
      candle(12, 11, 12, 100),
      candle(11, 10, 11, 200),
      candle(10, 9, 10, 300),
    ];
    expect(obvSeries(candles)).toEqual([0, -200, -500]);
  });

  it('캔들이 없거나 하나뿐이어도 안전하다', () => {
    expect(obvSeries([])).toEqual([]);
    expect(obvSeries([candle(10, 9, 10, 100)])).toEqual([0]);
  });

  it('길이가 입력과 같다', () => {
    expect(obvSeries(fixtureCandles)).toHaveLength(fixtureCandles.length);
  });

  it('각 시점 값이 그 시점까지의 캔들만으로 계산한 값과 같다 (룩어헤드 없음)', () => {
    const series = obvSeries(fixtureCandles);
    for (let i = 0; i < fixtureCandles.length; i++) {
      const prefix = obvSeries(fixtureCandles.slice(0, i + 1));
      expect(series[i]).toBe(prefix[i]);
    }
  });
});

describe('emvSeries', () => {
  // 손계산 픽스처 (period=2). scale = EMV_VOLUME_SCALE.
  //  idx0: 고10/저8       → 중간값 9
  //  idx1: 고12/저10, 거래량 200 → 중간값 11, DM = 11 − 9 = +2
  //        BR = (200/scale)/(12−10) = 100/scale
  //        EMV1 = 2 / (100/scale) = scale/50
  //  idx2: 고11/저9, 거래량 400   → 중간값 10, DM = 10 − 11 = −1
  //        BR = (400/scale)/(11−9) = 200/scale
  //        EMV1 = −1 / (200/scale) = −scale/200
  //  EMV(2) at idx2 = (scale/50 + (−scale/200))/2 = scale × 0.0075
  const handChecked: Candle[] = [
    candle(10, 8, 9, 100),
    candle(12, 10, 11, 200),
    candle(11, 9, 10, 400),
  ];

  it('알려진 입력에 대해 기대값을 낸다', () => {
    // 기대값을 EMV_VOLUME_SCALE로 표현한다 — scale은 아직 확정 전(TODO(confirm))이라
    // 숫자를 박아두면 scale을 고칠 때 이 테스트가 "왜 깨지는지" 알 수 없게 된다.
    const series = emvSeries(handChecked, 2);
    expect(series[0]).toBeNull();
    expect(series[1]).toBeNull(); // 1기간 EMV가 1개뿐이라 SMA(2)가 아직 안 된다
    expect(series[2]).toBeCloseTo(EMV_VOLUME_SCALE * 0.0075, 8);
  });

  it('1기간 EMV의 SMA다 (period=1이면 평활 없이 그대로)', () => {
    // period=1이면 SMA가 항등이므로 1기간 EMV가 그대로 나온다
    const series = emvSeries(handChecked, 1);
    expect(series[1]).toBeCloseTo(EMV_VOLUME_SCALE / 50, 8); // +2 이동
    expect(series[2]).toBeCloseTo(-EMV_VOLUME_SCALE / 200, 8); // −1 이동
    // period=2 값은 위 두 값의 평균이어야 한다
    const smoothed = emvSeries(handChecked, 2);
    expect(smoothed[2]).toBeCloseTo((series[1]! + series[2]!) / 2, 8);
  });

  it('가격이 오르면 양수, 내리면 음수 (부호가 방향을 말한다)', () => {
    // 적은 거래량으로 크게 오른 캔들 → 큰 양수
    const up = emvSeries([candle(10, 8, 9, 100), candle(14, 12, 13, 50)], 1);
    expect(up[1]!).toBeGreaterThan(0);
    // 같은 폭으로 내린 캔들 → 대칭인 음수
    const down = emvSeries([candle(14, 12, 13, 100), candle(10, 8, 9, 50)], 1);
    expect(down[1]!).toBeLessThan(0);
    expect(down[1]!).toBeCloseTo(-up[1]!, 8);
  });

  it('거래량이 클수록 같은 이동의 EMV가 작다 (움직이기 어려웠다는 뜻)', () => {
    const light = emvSeries([candle(10, 8, 9, 100), candle(12, 10, 11, 100)], 1);
    const heavy = emvSeries([candle(10, 8, 9, 100), candle(12, 10, 11, 1000)], 1);
    expect(heavy[1]!).toBeGreaterThan(0);
    expect(heavy[1]!).toBeLessThan(light[1]!);
  });

  it('고가 == 저가면 0 (0으로 나누기 방지)', () => {
    // 범위가 0이라 Box Ratio가 무한대로 발산한다 → EMV = DM/∞ = 0 (극한값).
    // 식을 그대로 태웠다면 DM이 0일 때 0/0 → NaN이 새어나온다.
    const series = emvSeries([candle(10, 8, 9, 100), candle(12, 12, 12, 200)], 1);
    expect(series[1]).toBe(0);
    expect(Number.isNaN(series[1]!)).toBe(false);

    // 직전 캔들도 범위가 0이라 DM까지 0인 경우 (0/0이 나던 자리)
    const flat = emvSeries([candle(10, 10, 10, 100), candle(10, 10, 10, 200)], 1);
    expect(flat[1]).toBe(0);
  });

  it('거래량이 0이면 0 (0으로 나누기 방지)', () => {
    // 체결이 없어 Box Ratio = 0 → DM/0이 ±무한대로 발산한다.
    // 무한대가 SMA로 흘러들면 이후 period개 구간이 통째로 날아간다.
    const series = emvSeries([candle(10, 8, 9, 100), candle(14, 12, 13, 0)], 1);
    expect(series[1]).toBe(0);
    expect(Number.isFinite(series[1]!)).toBe(true);

    // 무한대가 SMA를 오염시키지 않는지 확인 (거래량 0 캔들이 창 안에 섞인 경우)
    const mixed = emvSeries(
      [candle(10, 8, 9, 100), candle(14, 12, 13, 0), candle(12, 10, 11, 200)],
      2,
    );
    expect(Number.isFinite(mixed[2]!)).toBe(true);
    // (0 + (−1기간 EMV))/2 — 거래량 0 캔들만 0으로 처리되고 나머지는 살아 있다
    expect(mixed[2]).toBeCloseTo(emvSeries([candle(14, 12, 13, 0), candle(12, 10, 11, 200)], 1)[1]! / 2, 8);
  });

  it('데이터가 부족하면 전부 null (period + 1 미만)', () => {
    // 1기간 EMV는 인덱스 1부터 생기므로 period개를 모으려면 period+1개 캔들이 필요하다
    expect(emvSeries(handChecked, 3)).toEqual([null, null, null]);
    expect(emvSeries([], 14)).toEqual([]);
    expect(emvSeries([candle(10, 8, 9, 100)], 1)).toEqual([null]);
    // 딱 period+1개면 계산된다
    expect(emvSeries(handChecked, 2)[2]).not.toBeNull();
  });

  it('period가 0 이하면 전부 null', () => {
    expect(emvSeries(handChecked, 0)).toEqual([null, null, null]);
    expect(emvSeries(handChecked, -1)).toEqual([null, null, null]);
  });

  it('길이가 입력과 같다', () => {
    expect(emvSeries(fixtureCandles, 5)).toHaveLength(fixtureCandles.length);
    expect(emvSeries(fixtureCandles, 14)).toHaveLength(fixtureCandles.length);
  });

  it('각 시점 값이 그 시점까지의 캔들만으로 계산한 값과 같다 (룩어헤드 없음)', () => {
    const series = emvSeries(fixtureCandles, 3);
    for (let i = 0; i < fixtureCandles.length; i++) {
      const prefix = emvSeries(fixtureCandles.slice(0, i + 1), 3);
      if (series[i] === null) {
        expect(prefix[i]).toBeNull();
        continue;
      }
      expect(prefix[i]).toBeCloseTo(series[i]!, 10);
    }
  });

  it('기본 period는 14다', () => {
    expect(EMV_DEFAULT_PERIOD).toBe(14);
    expect(emvSeries(fixtureCandles)).toEqual(emvSeries(fixtureCandles, 14));
  });

  it('scale은 10,000이며 확정 전이다', () => {
    // TODO(confirm): 바이낸스 차트의 실제 scale과 대조 후 확정해야 한다 (volume.ts 주석 참조).
    // 이 테스트는 값을 검증하는 게 아니라 "여기 확정 안 된 상수가 있다"를 눈에 띄게 고정한다.
    // scale이 바뀌면 화면 y축 눈금이 바뀌므로 반드시 의식하고 고쳐야 한다.
    expect(EMV_VOLUME_SCALE).toBe(10_000);
  });
});
