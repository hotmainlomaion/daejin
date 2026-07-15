/**
 * 거래량 계열 지표 (바이낸스 서브 지표: OBV, EMV).
 *
 * ⚠️ 차트 표시용 참고 자료다. 봇의 판단에는 쓰이지 않는다 (CLAUDE.md 가드레일 2).
 * 돈 로직이므로 순수 함수 + 단위 테스트로 고정한다 (CLAUDE.md 코딩 컨벤션).
 */

import { sma } from './moving-averages.ts';
import type { Candle } from '../types.ts';

/** EMV 기본 기간. */
export const EMV_DEFAULT_PERIOD = 14;

/**
 * EMV의 거래량 스케일.
 *
 * Box Ratio = (거래량 / scale) / (고가 − 저가) 의 그 scale이다. EMV는 값 자체의 절대
 * 크기에 의미가 없고 0선 교차·부호가 읽는 대상이라 scale은 y축 눈금만 바꾼다. 하지만
 * 화면에 찍히는 숫자가 바이낸스와 다르면 유저가 화면을 믿지 못하므로 상수로 노출한다.
 *
 * TODO(confirm): 구현마다 값이 다르다 (Arms 원본·전통 주식 툴은 10,000, 크립토 툴은
 * 100,000,000을 쓰기도 한다). 여기서는 Arms 원본 정의인 10,000을 두되, 바이낸스 차트가
 * 실제로 어떤 scale을 쓰는지 공식 문서/실제 화면값과 대조해서 확정해야 한다.
 * 추측으로 확정하지 않는다 (CLAUDE.md 코딩 컨벤션).
 */
export const EMV_VOLUME_SCALE = 10_000;

/**
 * 각 시점의 OBV(On Balance Volume)를 배열로. 차트 보조지표 패인용.
 *
 * 종가가 전일보다 오르면 +거래량, 내리면 −거래량, 같으면 변화 없음. 이걸 누적한다.
 * "가격이 오를 때 거래량이 실렸는가"를 한 선으로 보는 지표라 절대값이 아니라 기울기를 읽는다.
 *
 * 첫 캔들은 **기준점 0**으로 둔다. OBV는 누적값이라 절대 수준에 의미가 없고 차이만
 * 의미가 있으므로, 첫 거래량으로 시작하면 시작점이 심볼·기간에 따라 제멋대로 튄다.
 * 0에서 출발해야 "조회 구간 시작 대비 누적 거래량"으로 읽혀 차트가 해석 가능하다.
 * (첫 거래량으로 시드하는 구현과는 전 구간이 상수만큼 평행이동한 차이라 모양은 같다.)
 *
 * 길이는 항상 입력과 같고, 각 시점은 그 시점까지의 캔들만 보므로 룩어헤드가 없다.
 */
export function obvSeries(candles: readonly Candle[]): number[] {
  const out: number[] = new Array<number>(candles.length).fill(0);
  let acc = 0;
  for (let i = 1; i < candles.length; i++) {
    const close = candles[i]!.close;
    const prevClose = candles[i - 1]!.close;
    // 종가가 같으면 거래량을 더하지도 빼지도 않는다 (OBV 정의)
    if (close > prevClose) acc += candles[i]!.volume;
    else if (close < prevClose) acc -= candles[i]!.volume;
    out[i] = acc;
  }
  return out;
}

/**
 * 1기간 EMV. 직전 캔들이 필요하므로 인덱스 0에는 정의되지 않는다.
 *
 * Distance Moved = ((고+저)/2) − ((전일 고+전일 저)/2)
 * Box Ratio      = (거래량 / EMV_VOLUME_SCALE) / (고 − 저)
 * EMV(1기간)     = Distance Moved / Box Ratio
 *
 * ⚠️ 0으로 나누기가 나는 두 자리를 여기서 한 번에 막는다.
 * - 고 === 저 → Box Ratio의 분모가 0이라 BR이 무한대로 발산한다. EMV = DM/∞ 이므로
 *   극한값 0을 쓴다. "가격 범위가 0인 캔들은 아무리 거래량이 실려도 움직임이 없었다"는
 *   해석과도 맞는다. (식을 그대로 태우면 DM=0일 때 0/0 → NaN이 나므로 반드시 분기한다.)
 * - 거래량 === 0 → BR = 0이라 DM/0이 ±무한대로 발산한다. 체결이 전혀 없었으므로
 *   "움직임의 용이함"을 잴 근거가 없다 → 0. 무한대를 그대로 두면 SMA가 오염되어
 *   이후 period개 구간 전체가 ±Infinity로 날아가 차트가 통째로 사라진다.
 */
function oneBarEmv(prev: Candle, cur: Candle): number {
  const range = cur.high - cur.low;
  if (range === 0 || cur.volume === 0) return 0;

  const distanceMoved = (cur.high + cur.low) / 2 - (prev.high + prev.low) / 2;
  const boxRatio = cur.volume / EMV_VOLUME_SCALE / range;
  return distanceMoved / boxRatio;
}

/**
 * 각 시점의 EMV(Ease of Movement)를 배열로. 차트 보조지표 패인용.
 *
 * 1기간 EMV의 SMA(period). 평균은 `sma()`를 그대로 호출한다 — 계산을 두 벌 두지 않는다.
 *
 * 길이는 항상 입력과 같다. 1기간 EMV가 인덱스 1부터 생기므로 period개가 모이는
 * 인덱스 period 이전은 null이다 (차트에서 선이 시작되지 않는다).
 * 각 시점은 그 시점까지의 캔들만 보므로 룩어헤드가 없다.
 */
export function emvSeries(
  candles: readonly Candle[],
  period: number = EMV_DEFAULT_PERIOD,
): (number | null)[] {
  const out: (number | null)[] = new Array<number | null>(candles.length).fill(null);
  if (period <= 0 || candles.length < period + 1) return out;

  const ones: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    ones.push(oneBarEmv(candles[i - 1]!, candles[i]!));
    // ones의 마지막 원소가 캔들 인덱스 i에 대응한다 (ones[j] ↔ candles[j + 1])
    out[i] = sma(ones, period);
  }
  return out;
}
