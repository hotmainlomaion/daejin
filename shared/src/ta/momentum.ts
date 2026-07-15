/**
 * MTM(Momentum)과 WR(Williams %R) — 바이낸스 서브 지표.
 *
 * 둘 다 "현재가가 최근 구간에서 어디쯤인가"를 보는 모멘텀 계열이라 한 파일에 둔다.
 * 차트 표시용 참고 자료다 — 봇의 판단에는 쓰이지 않는다 (CLAUDE.md 가드레일 2).
 */

import type { Candle } from '../types.ts';

/** 바이낸스 차트 기본값. */
export const MTM_PERIOD = 12;
export const WILLIAMS_R_PERIOD = 14;

/**
 * 각 시점의 MTM(모멘텀)을 배열로.
 *   MTM = 현재가 - period 이전 가격 (비율이 아니라 단순 차이)
 *
 * 이동평균이 필요 없는 지표라 `moving-averages.ts`를 쓰지 않는다.
 * 인덱스 i의 값은 values[i-period]가 있어야 하므로 앞 period개는 null이고,
 * 길이는 항상 입력과 같다. period가 0 이하면 전 구간 null.
 */
export function mtmSeries(values: readonly number[], period: number = MTM_PERIOD): (number | null)[] {
  const out: (number | null)[] = new Array<number | null>(values.length).fill(null);
  if (period <= 0) return out;

  for (let i = period; i < values.length; i++) {
    out[i] = values[i]! - values[i - period]!;
  }
  return out;
}

/**
 * 각 시점의 Williams %R을 배열로.
 *   %R = (기간 최고가 - 현재 종가) / (기간 최고가 - 기간 최저가) × -100
 *
 * 값은 항상 -100 ~ 0 이다 (종가가 기간 최고가면 0, 최저가면 -100).
 * 최고/최저는 종가가 아니라 캔들의 high/low로 잡는다 — 바이낸스 화면과 어긋나면 안 된다.
 *
 * 윈도는 [i-period+1, i]라 첫 값은 인덱스 period-1에서 나온다. 미래 캔들은 보지 않는다.
 * 길이는 항상 입력과 같고, period가 0 이하면 전 구간 null.
 */
export function williamsRSeries(
  candles: readonly Candle[],
  period: number = WILLIAMS_R_PERIOD,
): (number | null)[] {
  const out: (number | null)[] = new Array<number | null>(candles.length).fill(null);
  if (period <= 0) return out;

  for (let i = period - 1; i < candles.length; i++) {
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      const c = candles[j]!;
      if (c.high > highest) highest = c.high;
      if (c.low < lowest) lowest = c.low;
    }

    const range = highest - lowest;
    if (range === 0) {
      // 0으로 나누기: 기간 최고가 == 최저가 (구간이 완전히 평평함).
      // 분자도 0이라 0/0으로 정의되지 않는다. rsi.ts의 `toRsi`가 avgGain=avgLoss=0을
      // 관례값 50(중립)으로 두는 것과 같은 판단으로, -100~0의 중립인 -50을 쓴다.
      // 0(=과매수 최대치)이나 -100(=과매도 최대치)으로 두면 횡보 구간에서 화면이
      // 극단값으로 튀어 유저가 오독한다.
      // TODO(confirm): 바이낸스 차트가 완전 평평한 구간에서 실제로 어떤 값을 그리는지
      // (0 / -50 / 선 끊김) 실물 화면과 대조해 확정할 것. 지표 표시용이고 14봉이 전부
      // 같은 고가·저가인 경우는 사실상 없어 당장 위험은 없다.
      out[i] = -50;
      continue;
    }

    out[i] = ((highest - candles[i]!.close) / range) * -100;
  }
  return out;
}
