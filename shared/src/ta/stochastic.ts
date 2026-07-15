/**
 * 스토캐스틱 계열 지표 (바이낸스 서브 지표: KDJ, StochRSI).
 *
 * 둘 다 "기간 최고/최저 사이에서 지금 값이 어디쯤인가"를 0~100으로 보는 같은 뼈대지만,
 * KDJ는 **가격**에, StochRSI는 **RSI 값**에 그 뼈대를 적용한다. 이 차이가 두 지표의 전부다.
 *
 * ⚠️ 차트 표시용 참고 자료다. 봇의 판단에는 쓰이지 않는다 (CLAUDE.md 가드레일 2).
 * 돈 로직이므로 순수 함수 + 단위 테스트로 고정한다 (CLAUDE.md 코딩 컨벤션).
 */

import { sma } from './moving-averages.ts';
import { rsiSeries } from './rsi.ts';
import type { Candle } from '../types.ts';

/** KDJ 기본값 (바이낸스 차트 기본 표기 9,3,3). */
export const KDJ_DEFAULT_PERIOD = 9;
export const KDJ_DEFAULT_K_SMOOTH = 3;
export const KDJ_DEFAULT_D_SMOOTH = 3;

/** StochRSI 기본값 (바이낸스 차트 기본 표기 14,14,3,3). */
export const STOCH_RSI_DEFAULT_RSI_PERIOD = 14;
export const STOCH_RSI_DEFAULT_STOCH_PERIOD = 14;
export const STOCH_RSI_DEFAULT_K_SMOOTH = 3;
export const STOCH_RSI_DEFAULT_D_SMOOTH = 3;

/**
 * KDJ 평활의 시드값.
 *
 * 첫 RSV가 나오는 시점에는 직전 K/D가 없다. 중화권 표준 KDJ는 이때 K=D=50(중립)에서
 * 출발한다. 0이나 첫 RSV로 시드하면 초반 몇 캔들의 K/D가 화면상 다른 툴과 어긋난다.
 *
 * TODO(confirm): 바이낸스 차트가 정확히 50 시드를 쓰는지 실제 화면값과 대조 필요.
 * 시드 차이는 Wilder 평활 특성상 캔들이 쌓이면 지수적으로 감쇠하므로 후반부 값에는
 * 사실상 영향이 없지만, 초반 구간은 눈에 띄게 다를 수 있다.
 */
const KDJ_SEED = 50;

/**
 * 기간 최고/최저 사이에서 값의 상대 위치를 0~100으로 낸다 (스토캐스틱의 핵심 식).
 *
 * ⚠️ highest === lowest면 0으로 나누기가 난다. 구간 내내 값이 한 점에 고정된 경우이며,
 *    "최고가이자 동시에 최저가"라 위치를 정의할 수 없다. rsi.ts의 `toRsi`가 무변동 구간을
 *    50(중립)으로 두는 것과 같은 근거로 여기서도 50을 쓴다 — 0이나 100으로 두면
 *    횡보 구간에서 과매도/과매수 극단값이 찍혀 차트가 거짓말을 한다.
 */
function stochPosition(value: number, lowest: number, highest: number): number {
  const range = highest - lowest;
  if (range === 0) return 50;
  return ((value - lowest) / range) * 100;
}

/** 한 시점의 KDJ. 데이터가 부족한 앞 구간은 각 필드가 null이다. */
export interface KdjValue {
  k: number | null;
  d: number | null;
  j: number | null;
}

/**
 * 각 시점의 KDJ를 배열로. 차트 보조지표 패인용.
 *
 * RSV = (종가 − 기간 최저가) / (기간 최고가 − 기간 최저가) × 100
 * K   = RSV의 평활, D = K의 평활, J = 3K − 2D
 *
 * ⚠️ **평활 방식: SMA가 아니라 "1/3 가중 누적"(= 기간 3의 Wilder/SMMA와 동등)이다.**
 *    K_today = ((kSmooth − 1) × K_yesterday + RSV_today) / kSmooth
 *    kSmooth=3이면 K = (2/3)×K_전일 + (1/3)×RSV 가 되며 이게 표준 KDJ다.
 *    D도 같은 식으로 K를 평활한다. SMA로 구현하면 화면값이 다른 툴과 어긋난다.
 *
 * J는 3K − 2D라 K/D와 달리 0~100을 벗어날 수 있다 (의도된 성질 — J의 과열 표시용).
 *
 * 길이는 항상 입력과 같고, 최고/최저 창이 차지 않는 앞 구간(인덱스 < period − 1)은 null이다.
 * 각 시점은 그 시점까지의 캔들만 보므로 룩어헤드가 없다.
 */
export function kdjSeries(
  candles: readonly Candle[],
  period: number = KDJ_DEFAULT_PERIOD,
  kSmooth: number = KDJ_DEFAULT_K_SMOOTH,
  dSmooth: number = KDJ_DEFAULT_D_SMOOTH,
): KdjValue[] {
  const out: KdjValue[] = candles.map(() => ({ k: null, d: null, j: null }));
  if (period <= 0 || kSmooth <= 0 || dSmooth <= 0) return out;
  if (candles.length < period) return out;

  let k = KDJ_SEED;
  let d = KDJ_SEED;

  for (let i = period - 1; i < candles.length; i++) {
    // 최근 period개 캔들의 최고가/최저가 (고가·저가 기준 — 종가 기준이 아니다)
    let highest = candles[i]!.high;
    let lowest = candles[i]!.low;
    for (let j = i - period + 1; j < i; j++) {
      const c = candles[j]!;
      if (c.high > highest) highest = c.high;
      if (c.low < lowest) lowest = c.low;
    }

    const rsv = stochPosition(candles[i]!.close, lowest, highest);
    k = ((kSmooth - 1) * k + rsv) / kSmooth;
    d = ((dSmooth - 1) * d + k) / dSmooth;
    out[i] = { k, d, j: 3 * k - 2 * d };
  }
  return out;
}

/** 한 시점의 StochRSI. 데이터가 부족한 앞 구간은 각 필드가 null이다. */
export interface StochRsiValue {
  k: number | null;
  d: number | null;
}

/**
 * 창(window) 안에 null이 하나라도 있으면 null, 아니면 그 창의 SMA.
 *
 * 앞 구간이 null인 시리즈(RSI·StochRSI)를 평활할 때 쓴다. null을 0으로 치환해서
 * 평균을 내면 지표가 시작하자마자 가짜로 눌린 값이 찍히므로 창이 다 찰 때까지 null로 둔다.
 * 계산은 `sma()`를 그대로 호출한다 — 평균 구현을 두 벌 두지 않는다.
 */
function smaOfWindow(series: readonly (number | null)[], endIndex: number, period: number): number | null {
  if (period <= 0 || endIndex - period + 1 < 0) return null;
  const window: number[] = [];
  for (let i = endIndex - period + 1; i <= endIndex; i++) {
    const v = series[i];
    if (v === null || v === undefined) return null;
    window.push(v);
  }
  return sma(window, period);
}

/**
 * 각 시점의 StochRSI를 배열로. 차트 보조지표 패인용.
 *
 * ⚠️ **가격이 아니라 RSI 값에 스토캐스틱을 적용한 지표다.** 가격에 적용하면 그건 그냥
 *    스토캐스틱(KDJ)이지 StochRSI가 아니다. RSI 계산은 `rsiSeries()`를 그대로 재사용한다 —
 *    RSI 패인의 선과 StochRSI가 다른 RSI를 보면 안 되므로 계산을 따로 구현하지 않는다.
 *
 * StochRSI = (RSI − 기간 RSI최저) / (기간 RSI최고 − 기간 RSI최저)
 * K = StochRSI의 SMA(kSmooth) × 100, D = K의 SMA(dSmooth)
 *
 * K/D 평활은 KDJ와 달리 **SMA**다 (StochRSI의 통상 정의).
 *
 * 길이는 항상 입력과 같다. RSI 자체가 앞 구간에서 null이므로, RSI 창이 다 차기 전에는
 * StochRSI도 null이다 (첫 K는 인덱스 rsiPeriod + stochPeriod + kSmooth − 2 부근).
 */
export function stochRsiSeries(
  values: readonly number[],
  rsiPeriod: number = STOCH_RSI_DEFAULT_RSI_PERIOD,
  stochPeriod: number = STOCH_RSI_DEFAULT_STOCH_PERIOD,
  kSmooth: number = STOCH_RSI_DEFAULT_K_SMOOTH,
  dSmooth: number = STOCH_RSI_DEFAULT_D_SMOOTH,
): StochRsiValue[] {
  const out: StochRsiValue[] = values.map(() => ({ k: null, d: null }));
  if (rsiPeriod <= 0 || stochPeriod <= 0 || kSmooth <= 0 || dSmooth <= 0) return out;

  const rsis = rsiSeries(values, rsiPeriod);

  // 1) 원시 StochRSI (0~100 스케일). RSI 창이 다 차지 않은 앞 구간은 null.
  const raw: (number | null)[] = values.map(() => null);
  for (let i = stochPeriod - 1; i < rsis.length; i++) {
    let highest = -Infinity;
    let lowest = Infinity;
    let complete = true;
    for (let j = i - stochPeriod + 1; j <= i; j++) {
      const r = rsis[j];
      // 창 안에 RSI가 아직 없는 시점이 섞여 있으면 최고/최저가 무의미하다 → null
      if (r === null || r === undefined) {
        complete = false;
        break;
      }
      if (r > highest) highest = r;
      if (r < lowest) lowest = r;
    }
    if (!complete) continue;
    // ⚠️ highest === lowest(구간 RSI가 완전 평평, 예: 단조 상승이라 RSI가 계속 100)면
    //    0으로 나누기 → stochPosition이 50(중립)을 낸다. 근거는 stochPosition 주석 참조.
    raw[i] = stochPosition(rsis[i]!, lowest, highest);
  }

  // 2) K = raw의 SMA(kSmooth), D = K의 SMA(dSmooth)
  //    raw가 이미 0~100 스케일이라 별도로 ×100 하지 않는다 ((x×100)의 평균 = 평균×100).
  const ks: (number | null)[] = values.map((_, i) => smaOfWindow(raw, i, kSmooth));
  for (let i = 0; i < values.length; i++) {
    out[i] = { k: ks[i] ?? null, d: smaOfWindow(ks, i, dSmooth) };
  }
  return out;
}
