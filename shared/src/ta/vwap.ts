/**
 * VWAP / AVL — 거래량 가중 평균가 계열 (바이낸스 메인 지표).
 *
 * 돈 로직이므로 순수 함수 + 단위 테스트로 고정한다 (CLAUDE.md 코딩 컨벤션).
 */

import type { Candle } from '../types.ts';

/**
 * 전형가(typical price) = (고가 + 저가 + 종가) / 3.
 * 캔들 하나를 대표하는 단일 가격. VWAP·AVL·CCI가 공통으로 쓴다.
 */
function typicalPrice(candle: Candle): number {
  return (candle.high + candle.low + candle.close) / 3;
}

/**
 * 배열 첫 캔들부터 누적한 거래량 가중 평균가.
 *
 * VWAP과 AVL이 공유하는 계산 본체. 두 지표의 정의가 갈릴 수 있으므로
 * (아래 avlSeries의 TODO 참조) 공개 함수는 따로 두되 본체는 하나만 둔다.
 *
 * 누적 거래량이 0인 구간은 0으로 나누기가 되므로 null.
 * (거래가 한 건도 없는 캔들만 이어진 구간 — 평균가를 정의할 수 없다.)
 */
function cumulativeVolumeWeightedAvgSeries(candles: readonly Candle[]): (number | null)[] {
  const out: (number | null)[] = new Array<number | null>(candles.length).fill(null);

  let cumPriceVolume = 0;
  let cumVolume = 0;
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i]!;
    cumPriceVolume += typicalPrice(candle) * candle.volume;
    cumVolume += candle.volume;
    // 누적 거래량이 0이면 정의되지 않는다 → null (0으로 나누기 방지)
    out[i] = cumVolume === 0 ? null : cumPriceVolume / cumVolume;
  }
  return out;
}

/**
 * 각 시점의 VWAP을 배열로. 차트 오버레이용.
 *
 * VWAP = Σ(전형가 × 거래량) / Σ(거래량), 배열 첫 캔들부터 누적.
 * 길이는 항상 입력과 같다.
 *
 * TODO(confirm): 세션 리셋 여부를 확정해야 한다.
 *   실제 거래소의 VWAP은 보통 **세션(하루) 시작 시점에 누적을 리셋**한다.
 *   여기서는 캔들 배열만 받으므로 세션 경계를 알 수 없어 **배열 전체를 하나의
 *   세션으로 보고 누적**한다. 즉 여러 날치 캔들을 넣으면 거래소 화면의 VWAP과
 *   값이 어긋난다.
 *   추측으로 하루 경계를 만들어내지 않은 이유: 바이낸스 선물 차트의 VWAP이
 *   어떤 기준(UTC 자정 / 거래소 세션 / 리셋 없음)으로 리셋하는지 확인하지 않았고,
 *   틀린 경계는 "리셋 없음"보다 더 나쁘게 어긋나기 때문이다.
 *   공식 문서·실제 차트와 대조 후 결정한다. 세션 리셋으로 확정되면 캔들의
 *   `openTime`으로 경계를 잡거나, 호출부에서 세션 단위로 잘라 넘기게 바꾼다.
 */
export function vwapSeries(candles: readonly Candle[]): (number | null)[] {
  return cumulativeVolumeWeightedAvgSeries(candles);
}

/**
 * 각 시점의 AVL(평균가)을 배열로. 차트 오버레이용.
 *
 * 누적 거래량 가중 평균가 = Σ(전형가 × 거래량) / Σ(거래량) 로 구현한다.
 * 길이는 항상 입력과 같다.
 *
 * TODO(confirm): 바이낸스 AVL의 정확한 정의를 확인해야 한다.
 *   바이낸스의 AVL이 누적 거래량 가중 평균가(= 현재 vwapSeries와 동일)라고
 *   알려져 있으나 **확인하지 못했다.** 가능성이 남아 있는 다른 정의들:
 *   거래량 가중이 아닌 단순 누적 평균가일 수도, 전형가가 아닌 종가 기준일
 *   수도, VWAP처럼 세션마다 리셋할 수도 있다.
 *   확인 전까지는 가장 단순하고 방어 가능한 정의(누적 거래량 가중 평균가)를
 *   쓰되, 추측으로 그럴듯한 변형을 만들어내지 않는다.
 *   ⚠️ 정의가 확정되기 전에는 VWAP과 값이 같다. 확정 후 갈라지면 이 함수만
 *   고치면 되도록 vwapSeries를 호출하지 않고 계산 본체를 직접 부른다.
 */
export function avlSeries(candles: readonly Candle[]): (number | null)[] {
  return cumulativeVolumeWeightedAvgSeries(candles);
}
