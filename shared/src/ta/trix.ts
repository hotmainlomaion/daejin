/**
 * TRIX (바이낸스 지표).
 *
 * 삼중 지수이동평균(EMA를 세 번 겹쳐 태운 값)의 **변화율(%)**.
 *   TRIX = (삼중EMA_오늘 - 삼중EMA_어제) / 삼중EMA_어제 × 100
 *
 * ⚠️ 이름 주의: 여기서 말하는 "삼중 EMA"는 EMA(EMA(EMA(price)))이며,
 *    별개의 지표인 TEMA(= 3·EMA1 - 3·EMA2 + EMA3)가 아니다. 둘은 값이 다르다.
 *    TRIX는 전자를 쓴다 (TradingView·바이낸스 기준).
 *
 * 차트 표시용 참고 자료다 — 봇의 판단에는 쓰이지 않는다 (CLAUDE.md 가드레일 2).
 */

import { emaOfNullableSeries } from './macd.ts';
import { maSeries } from './moving-averages.ts';

/** 바이낸스 차트 기본값. */
export const TRIX_PERIOD = 12;

/**
 * 각 시점의 TRIX를 배열로. 차트 보조지표 패인용.
 *
 * EMA를 세 번 겹칠 때 앞 구간의 null을 어떻게 다루는지는 MACD 시그널선과 같은 문제다 —
 * null을 0으로 채우면 가짜 값이 그려지므로, 매 단계마다 null 구간을 제외하고 EMA를
 * 다시 시작한다 (`emaOfNullableSeries`의 주석 참조). 그래서 첫 TRIX 값은
 * 대략 3·(period-1) + 1 번째 캔들에서야 나온다.
 *
 * 길이는 항상 입력과 같고, period가 0 이하면 전 구간 null.
 */
export function trixSeries(values: readonly number[], period: number = TRIX_PERIOD): (number | null)[] {
  const out: (number | null)[] = new Array<number | null>(values.length).fill(null);
  if (period <= 0) return out;

  const ema1 = maSeries(values, period, 'EMA');
  const ema2 = emaOfNullableSeries(ema1, period);
  const ema3 = emaOfNullableSeries(ema2, period);

  for (let i = 1; i < values.length; i++) {
    const prev = ema3[i - 1];
    const cur = ema3[i];
    if (prev === null || prev === undefined || cur === null || cur === undefined) continue;

    // 0으로 나누기: 삼중EMA_어제가 0이면 변화율이 수학적으로 정의되지 않는다
    // (0에서 0이 아닌 값으로 가는 변화는 "무한대 %"라 어떤 유한값도 거짓말이다).
    // RSI처럼 관례적인 중립값이 있는 지표가 아니므로 0이나 100 같은 값을 지어내지 않고
    // null로 둔다 → 차트에서 그 구간의 선이 끊길 뿐, 화면에 가짜 숫자가 뜨지 않는다.
    // 실제로 선물 가격은 양수라 삼중EMA가 0이 되는 일은 사실상 없다 (방어적 처리).
    if (prev === 0) continue;

    out[i] = ((cur - prev) / prev) * 100;
  }
  return out;
}
