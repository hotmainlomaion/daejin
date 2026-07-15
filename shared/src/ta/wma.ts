/**
 * WMA — 가중이동평균 (바이낸스 메인 지표).
 *
 * SMA/EMA와 같은 파일에 두지 않은 이유는 없다. 파일만 나뉘어 있을 뿐 규약은
 * moving-averages.ts와 동일하게 맞춘다 (데이터 부족·period<=0 → null).
 *
 * 돈 로직이므로 순수 함수 + 단위 테스트로 고정한다 (CLAUDE.md 코딩 컨벤션).
 */

/**
 * 가중이동평균. 마지막 `period`개에 선형 가중치를 준다.
 *
 * 가장 최근 값에 n, 그 앞에 n-1 … 가장 오래된 값에 1의 가중치를 주고,
 * 분모는 가중치의 합 n(n+1)/2 이다. SMA보다 최근 값에 민감하되, EMA와 달리
 * 창(window) 밖의 값은 전혀 반영하지 않는다.
 *
 * 데이터가 부족하면 null.
 */
export function wma(values: readonly number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;

  const start = values.length - period;
  let weightedSum = 0;
  for (let i = start; i < values.length; i++) {
    // i가 start일 때 가중치 1, 마지막 값일 때 가중치 period
    const weight = i - start + 1;
    weightedSum += values[i]! * weight;
  }
  // 가중치의 합 = 1 + 2 + … + period = period(period+1)/2
  const weightSum = (period * (period + 1)) / 2;
  return weightedSum / weightSum;
}

/**
 * 각 시점의 WMA를 배열로. 차트 오버레이용.
 *
 * ⚠️ maSeries와 같은 이유로 `wma()`를 그대로 호출한다 — 차트에 그려지는 선과
 * 단일 함수 값이 부동소수점 오차까지 같아야 하므로 계산을 두 벌 두지 않는다.
 * 데이터가 부족한 앞 구간은 null (차트에서 선이 시작되지 않는다).
 */
export function wmaSeries(values: readonly number[], period: number): (number | null)[] {
  return values.map((_, i) => wma(values.slice(0, i + 1), period));
}
