/**
 * DMI / ADX (바이낸스 서브 지표).
 *
 * +DI/−DI는 상승·하락 방향의 힘, ADX는 그 방향성이 얼마나 뚜렷한지(추세의 세기)를 본다.
 * ADX는 방향을 말하지 않는다 — 값이 높으면 "추세가 뚜렷하다"일 뿐 상승인지 하락인지는
 * +DI/−DI의 상하관계가 말한다.
 *
 * ⚠️ 차트 표시용 참고 자료다. 봇의 판단에는 쓰이지 않는다 (CLAUDE.md 가드레일 2).
 * 돈 로직이므로 순수 함수 + 단위 테스트로 고정한다 (CLAUDE.md 코딩 컨벤션).
 */

import type { Candle } from '../types.ts';

/** DMI/ADX 기본 기간 (Wilder 원본·바이낸스 기본값). */
export const DMI_DEFAULT_PERIOD = 14;

/** 한 시점의 DMI. 데이터가 부족한 앞 구간은 각 필드가 null이다. */
export interface DmiValue {
  plusDi: number | null;
  minusDi: number | null;
  adx: number | null;
}

/**
 * 각 시점의 +DI/−DI/ADX를 배열로. 차트 보조지표 패인용.
 *
 * - +DM = 현재고가 − 전일고가 (단, −DM보다 크고 0보다 클 때만, 아니면 0)
 * - −DM = 전일저가 − 현재저가 (단, +DM보다 크고 0보다 클 때만, 아니면 0)
 * - TR  = max(고−저, |고−전일종가|, |저−전일종가|)
 * - +DI = 100 × 평활(+DM) / 평활(TR), −DI도 같은 식
 * - DX  = 100 × |+DI − −DI| / (+DI + −DI)
 * - ADX = DX의 평활
 *
 * ⚠️ **평활은 전부 Wilder 평활이다 (단순 평균이 아니다).** rsi.ts와 같은 규약을 쓴다:
 *    시드 = 처음 period개의 단순 평균, 이후 avg = (이전 avg × (period − 1) + 현재값) / period.
 *    TradingView·바이낸스가 Wilder를 쓰므로 단순 평균으로 구현하면 화면값이 어긋난다.
 *    (Wilder 원본은 평균 대신 합계를 누적하지만, +DI/−DI가 평활값의 **비율**이라
 *     분모·분자에서 period가 약분되어 결과는 동일하다. 여기서는 rsi.ts와 규약을 맞춘다.)
 *
 * 길이는 항상 입력과 같다. 각 필드가 채워지는 시점:
 * - +DI/−DI/DX: 인덱스 period (변화량이 period개 모여야 시드를 만든다 — rsi.ts와 같은 이유)
 * - ADX: 인덱스 2 × period − 1 (DX가 다시 period개 모여야 ADX 시드가 된다)
 * 각 시점은 그 시점까지의 캔들만 보므로 룩어헤드가 없다.
 */
export function dmiSeries(candles: readonly Candle[], period: number = DMI_DEFAULT_PERIOD): DmiValue[] {
  const out: DmiValue[] = candles.map(() => ({ plusDi: null, minusDi: null, adx: null }));
  // 변화량은 캔들 수보다 하나 적으므로 period개를 모으려면 period+1개가 필요하다.
  if (period <= 0 || candles.length < period + 1) return out;

  /** 인덱스 i의 +DM/−DM/TR (i >= 1). */
  const directional = (i: number): { plusDm: number; minusDm: number; tr: number } => {
    const cur = candles[i]!;
    const prev = candles[i - 1]!;
    const upMove = cur.high - prev.high;
    const downMove = prev.low - cur.low;
    // 두 방향이 동시에 인정되지 않는다: 더 큰 쪽만 남기고, 0 이하면 0.
    // upMove === downMove인 바깥쪽 확장(outside bar)은 어느 쪽도 우세하지 않으므로 둘 다 0.
    const plusDm = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDm = downMove > upMove && downMove > 0 ? downMove : 0;
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close),
    );
    return { plusDm, minusDm, tr };
  };

  // 시드: 처음 period개(인덱스 1..period)의 단순 평균
  let avgPlusDm = 0;
  let avgMinusDm = 0;
  let avgTr = 0;
  for (let i = 1; i <= period; i++) {
    const { plusDm, minusDm, tr } = directional(i);
    avgPlusDm += plusDm;
    avgMinusDm += minusDm;
    avgTr += tr;
  }
  avgPlusDm /= period;
  avgMinusDm /= period;
  avgTr /= period;

  /**
   * 평활값 한 쌍 → +DI/−DI/DX.
   *
   * 0으로 나누기가 나는 두 자리를 여기서 한 번에 막는다:
   * - 평활(TR) === 0 → 구간 내내 고가·저가·종가가 한 점에 고정된 캔들만 있었다는 뜻이다.
   *   움직임이 없으니 방향의 힘도 없다 → +DI = −DI = 0. (TR = 0이면 +DM/−DM도 0이라
   *   식은 0/0으로 정의되지 않는다. rsi.ts의 무변동 구간 처리와 같은 결.)
   * - +DI + −DI === 0 → 위 경우처럼 양쪽 힘이 모두 0이라 DX가 0/0이 된다.
   *   우세한 방향이 없다는 뜻이므로 DX = 0 (방향성 없음). 이 값을 100 쪽으로 두면
   *   횡보 구간에서 ADX가 강한 추세라고 거짓말을 한다.
   */
  const toDi = (): { plusDi: number; minusDi: number; dx: number } => {
    if (avgTr === 0) return { plusDi: 0, minusDi: 0, dx: 0 };
    const plusDi = (100 * avgPlusDm) / avgTr;
    const minusDi = (100 * avgMinusDm) / avgTr;
    const diSum = plusDi + minusDi;
    const dx = diSum === 0 ? 0 : (100 * Math.abs(plusDi - minusDi)) / diSum;
    return { plusDi, minusDi, dx };
  };

  const seed = toDi();

  // ADX 시드를 만들려면 DX가 period개 필요하다 (인덱스 period .. 2*period-1).
  // period === 1인 경계에서는 DX 한 개로 바로 시드가 차므로 여기서 이미 ADX가 나온다.
  let dxSum = seed.dx;
  let dxCount = 1;
  let adx: number | null = dxCount === period ? dxSum / period : null;
  out[period] = { plusDi: seed.plusDi, minusDi: seed.minusDi, adx };

  for (let i = period + 1; i < candles.length; i++) {
    const { plusDm, minusDm, tr } = directional(i);
    // Wilder 평활 (rsi.ts와 동일한 식)
    avgPlusDm = (avgPlusDm * (period - 1) + plusDm) / period;
    avgMinusDm = (avgMinusDm * (period - 1) + minusDm) / period;
    avgTr = (avgTr * (period - 1) + tr) / period;

    const { plusDi, minusDi, dx } = toDi();

    if (adx === null) {
      dxSum += dx;
      dxCount++;
      // DX가 period개 모이는 시점(인덱스 2*period-1)에 단순 평균으로 시드한다
      if (dxCount === period) adx = dxSum / period;
    } else {
      adx = (adx * (period - 1) + dx) / period;
    }

    out[i] = { plusDi, minusDi, adx };
  }
  return out;
}
