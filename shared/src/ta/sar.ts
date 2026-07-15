/**
 * SAR — 파라볼릭 SAR (Stop And Reverse, 바이낸스 메인 지표).
 *
 * Wilder의 표준 알고리즘을 따른다. 다만 SAR은 **변형이 많은 지표**라
 * 어떤 규칙을 채택했는지 아래 "채택한 규칙"에 전부 적어 둔다. 확신이 없는
 * 부분은 TODO(confirm)으로 남겼다 (CLAUDE.md 코딩 컨벤션).
 *
 * 돈 로직이므로 순수 함수 + 단위 테스트로 고정한다.
 */

import type { Candle } from '../types.ts';

/** Wilder 원안이자 바이낸스·TradingView 기본값. */
export const SAR_DEFAULT_STEP = 0.02;
export const SAR_DEFAULT_MAX_STEP = 0.2;

/**
 * 각 시점의 파라볼릭 SAR을 배열로. 차트 오버레이용(점으로 찍는다).
 *
 * 상태(추세 방향 / EP / AF)를 순차 갱신하는 지표라 한 번의 순회로 O(n)에 낸다.
 * 길이는 항상 입력과 같고, 인덱스 0은 항상 null이다 (직전 캔들이 없어 시드를
 * 만들 수 없다). 캔들이 2개 미만이거나 step/maxStep이 0 이하면 전부 null.
 *
 * ── 채택한 규칙 ──
 *
 * 1. 초기 추세 판정: `close[1] >= close[0]` 이면 상승, 아니면 하락.
 *    Wilder는 초기 추세를 어떻게 잡는지 명시하지 않았다. 첫 두 캔들의 종가
 *    비교는 가장 흔한 구현이다.
 *    TODO(confirm): 바이낸스가 같은 방식인지 확인하지 못했다. 초기 추세를
 *      어떻게 잡느냐에 따라 **배열 앞 구간의 SAR 점 위치가 달라진다.**
 *      (뒤로 갈수록 반전이 쌓이며 수렴하므로 앞 구간에만 영향이 크다.)
 *      실제 차트와 대조 후 확정한다.
 *
 * 2. 시드값: 상승이면 SAR = min(low[0], low[1]), EP = max(high[0], high[1]).
 *    하락이면 SAR = max(high[0], high[1]), EP = min(low[0], low[1]). AF = step.
 *    TODO(confirm): 1번과 같은 이유로 확인 대상. 시드를 "직전 캔들의 저가"
 *      하나만 쓰는 구현도 흔하다.
 *
 * 3. 갱신식: nextSar = sar + af * (ep - sar). (Wilder 원안 그대로)
 *
 * 4. SAR이 직전 캔들 범위를 침범할 때의 보정: **반전 판정 전에** 보정한다.
 *    - 상승 추세: nextSar = min(nextSar, low[i-1], low[i-2])
 *    - 하락 추세: nextSar = max(nextSar, high[i-1], high[i-2])
 *    Wilder 원안대로 **직전 2개 캔들**을 본다 (1개만 보는 변형도 있다).
 *    i=2일 때는 low[0]/high[0]까지 볼 수 있으므로 그대로 2개를 쓴다.
 *
 * 5. 반전 시점: 보정된 nextSar을 현재 캔들이 뚫으면(상승 중 low[i] < nextSar,
 *    하락 중 high[i] > nextSar) 그 캔들에서 즉시 반전한다.
 *    반전 시 SAR = 직전 추세의 EP, 새 EP = 현재 캔들의 극점(상승→하락이면
 *    low[i], 하락→상승이면 high[i]), AF = step으로 리셋.
 *    TODO(confirm): 반전 직후의 SAR(= 직전 EP)은 보정 대상에서 제외했다.
 *      이 값이 현재 캔들 범위 안에 들어올 수 있는데, 이를 다시 현재 캔들의
 *      극점으로 클램프하는 변형이 있다. 어느 쪽이 바이낸스와 맞는지 확인 필요.
 *
 * 6. EP 갱신·AF 증가 시점: 반전이 없었고 현재 캔들이 EP를 **경신했을 때만**
 *    EP를 갱신하고 동시에 AF += step (상한 maxStep). 경신이 없으면 AF는 그대로.
 *    반전이 일어난 캔들에서는 6번을 적용하지 않는다 (5번에서 이미 리셋했다).
 */
export function sarSeries(
  candles: readonly Candle[],
  step: number = SAR_DEFAULT_STEP,
  maxStep: number = SAR_DEFAULT_MAX_STEP,
): (number | null)[] {
  const out: (number | null)[] = new Array<number | null>(candles.length).fill(null);
  // 시드에 캔들 2개가 필요하다. step/maxStep이 0 이하면 SAR이 EP를 향해
  // 전혀 움직이지 않거나 발산하므로 계산하지 않는다.
  if (candles.length < 2 || step <= 0 || maxStep <= 0) return out;

  const first = candles[0]!;
  const second = candles[1]!;

  // 규칙 1·2: 초기 추세 판정과 시드값
  let isUptrend = second.close >= first.close;
  let sar = isUptrend
    ? Math.min(first.low, second.low)
    : Math.max(first.high, second.high);
  let ep = isUptrend
    ? Math.max(first.high, second.high)
    : Math.min(first.low, second.low);
  let af = Math.min(step, maxStep);
  out[1] = sar;

  for (let i = 2; i < candles.length; i++) {
    const cur = candles[i]!;
    const prev = candles[i - 1]!;
    const prev2 = candles[i - 2]!;

    // 규칙 3: 갱신식
    let nextSar = sar + af * (ep - sar);

    // 규칙 4: 직전 2개 캔들 범위 침범 보정 (반전 판정 전에 한다)
    if (isUptrend) {
      nextSar = Math.min(nextSar, prev.low, prev2.low);
    } else {
      nextSar = Math.max(nextSar, prev.high, prev2.high);
    }

    // 규칙 5: 반전 판정
    const reversed = isUptrend ? cur.low < nextSar : cur.high > nextSar;
    if (reversed) {
      isUptrend = !isUptrend;
      nextSar = ep; // 반전 시 SAR은 직전 추세의 EP에서 다시 시작한다
      ep = isUptrend ? cur.high : cur.low;
      af = Math.min(step, maxStep);
    } else if (isUptrend ? cur.high > ep : cur.low < ep) {
      // 규칙 6: EP 경신 시에만 EP 갱신 + AF 증가
      ep = isUptrend ? cur.high : cur.low;
      af = Math.min(af + step, maxStep);
    }

    sar = nextSar;
    out[i] = sar;
  }

  return out;
}
