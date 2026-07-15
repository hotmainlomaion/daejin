/**
 * 주문 수량 반올림.
 *
 * strategy-templates.md 구현 노트의 TODO(confirm) 대응:
 * "테스트넷 최소 주문 수량·가격 precision은 심볼별 exchange info로 확인 후 반올림 처리."
 *
 * 부동소수 오차로 stepSize를 어기면 -1111(Precision is over the maximum) 또는
 * -4014 오류가 난다. 그래서 float 나눗셈 대신 stepSize의 소수 자릿수로 내림한다.
 */
import type { ExchangeInfo } from './rest.ts';

export interface SymbolRules {
  /** 수량 최소 단위 */
  stepSize: number;
  /** 최소 주문 수량 */
  minQty: number;
  /** 최소 주문 명목가치 (수량 × 가격) */
  minNotional: number;
}

/** stepSize 문자열("0.001")에서 소수 자릿수를 센다. */
export function decimalsOf(step: string): number {
  const normalized = Number.parseFloat(step).toString();
  // 1e-7 같은 지수 표기 대응
  const exp = normalized.match(/e-(\d+)$/);
  if (exp) return Number.parseInt(exp[1]!, 10);
  const dot = normalized.indexOf('.');
  return dot === -1 ? 0 : normalized.length - dot - 1;
}

/**
 * 부동소수 곱셈 오차만 제거하고 값 자체는 바꾸지 않는다.
 *
 * 2.675 * 1000 = 2674.9999999999995 처럼 표현 오차로 아주 살짝 어긋난 경우만
 * 정수로 스냅하고, 1.9999 * 1000 = 1999.9 처럼 실제로 중간값인 경우는 그대로 둔다.
 * (여기서 Math.round를 쓰면 내림이어야 할 값이 올라가버린다.)
 */
function scaleWithoutFloatNoise(value: number, scale: number): number {
  const scaled = value * scale;
  const snapped = Math.round(scaled);
  return Math.abs(scaled - snapped) < 1e-9 ? snapped : scaled;
}

/**
 * 수량을 stepSize의 배수로 **내림**한다.
 * 올림하면 잔고를 초과해 -2019(Margin is insufficient)가 날 수 있으므로 항상 내림.
 */
export function roundQtyToStep(qty: number, stepSize: number): string {
  if (!Number.isFinite(qty) || qty <= 0) return '0';
  if (!Number.isFinite(stepSize) || stepSize <= 0) return String(qty);

  const decimals = decimalsOf(String(stepSize));
  // 정수 도메인에서 나눠 부동소수 오차를 피한다.
  const scale = 10 ** decimals;
  const scaledQty = scaleWithoutFloatNoise(qty, scale);
  const scaledStep = Math.round(stepSize * scale);
  const floored = Math.floor(scaledQty / scaledStep) * scaledStep;
  return (floored / scale).toFixed(decimals);
}

/** exchangeInfo 응답에서 심볼 규칙을 뽑는다. */
export function extractSymbolRules(info: ExchangeInfo, symbol: string): SymbolRules {
  const entry = info.symbols.find((s) => s.symbol === symbol);
  if (!entry) {
    throw new Error(`테스트넷 exchangeInfo에 심볼 ${symbol}이 없습니다.`);
  }

  const lotSize = entry.filters.find((f) => f.filterType === 'LOT_SIZE');
  const notional = entry.filters.find((f) => f.filterType === 'MIN_NOTIONAL');

  return {
    stepSize: lotSize?.stepSize ? Number.parseFloat(lotSize.stepSize) : 0.001,
    minQty: lotSize?.minQty ? Number.parseFloat(lotSize.minQty) : 0,
    minNotional: notional?.notional ? Number.parseFloat(notional.notional) : 0,
  };
}

/**
 * 진입 수량 계산: 가용 잔고의 positionSizePct%를 증거금으로 쓰고 레버리지를 곱한다.
 *
 * @returns 주문 가능한 수량 문자열, 또는 최소 조건 미달이면 사유
 */
export function computeEntryQty(args: {
  availableUsdt: number;
  positionSizePct: number;
  leverage: number;
  price: number;
  rules: SymbolRules;
}): { ok: true; qty: string } | { ok: false; reason: string } {
  const { availableUsdt, positionSizePct, leverage, price, rules } = args;

  if (price <= 0) return { ok: false, reason: '가격이 유효하지 않습니다.' };
  if (availableUsdt <= 0) return { ok: false, reason: '테스트넷 잔고가 없습니다.' };

  const margin = availableUsdt * (positionSizePct / 100);
  const notional = margin * leverage;
  const rawQty = notional / price;
  const qty = roundQtyToStep(rawQty, rules.stepSize);
  const qtyNum = Number.parseFloat(qty);

  if (qtyNum <= 0) {
    return { ok: false, reason: `계산된 수량이 최소 단위(${rules.stepSize}) 미만입니다.` };
  }
  if (rules.minQty > 0 && qtyNum < rules.minQty) {
    return { ok: false, reason: `최소 주문 수량(${rules.minQty}) 미만입니다.` };
  }
  if (rules.minNotional > 0 && qtyNum * price < rules.minNotional) {
    return {
      ok: false,
      reason: `최소 주문 금액(${rules.minNotional} USDT) 미만입니다. 진입 규모를 늘리세요.`,
    };
  }

  return { ok: true, qty };
}
