import { describe, expect, it } from 'vitest';
import { computeEntryQty, decimalsOf, extractSymbolRules, roundQtyToStep } from './precision.ts';
import type { ExchangeInfo } from './rest.ts';

describe('decimalsOf', () => {
  it('소수 자릿수를 센다', () => {
    expect(decimalsOf('0.001')).toBe(3);
    expect(decimalsOf('0.1')).toBe(1);
    expect(decimalsOf('1')).toBe(0);
    expect(decimalsOf('1.000')).toBe(0); // 정규화 후 판단
  });

  it('지수 표기도 처리한다', () => {
    expect(decimalsOf('1e-7')).toBe(7);
  });
});

describe('roundQtyToStep', () => {
  it('stepSize 배수로 내림한다', () => {
    expect(roundQtyToStep(0.123456, 0.001)).toBe('0.123');
    expect(roundQtyToStep(1.9999, 0.001)).toBe('1.999');
  });

  it('올림하지 않는다 — 잔고 초과 주문을 막기 위함', () => {
    expect(roundQtyToStep(0.0019, 0.001)).toBe('0.001');
  });

  it('부동소수 오차가 있어도 stepSize를 어기지 않는다', () => {
    // 0.1 + 0.2 = 0.30000000000000004
    expect(roundQtyToStep(0.1 + 0.2, 0.1)).toBe('0.3');
    expect(roundQtyToStep(2.675, 0.001)).toBe('2.675');
  });

  it('정수 stepSize도 내림한다', () => {
    // step=1이면 소수부는 전부 버린다. 7.9는 8이 아니라 7이다.
    expect(roundQtyToStep(7.9, 1)).toBe('7');
    expect(roundQtyToStep(7.2, 1)).toBe('7');
    expect(roundQtyToStep(8, 1)).toBe('8');
  });

  it('step 미만이면 0', () => {
    expect(roundQtyToStep(0.0005, 0.001)).toBe('0.000');
  });

  it('비정상 입력을 방어한다', () => {
    expect(roundQtyToStep(0, 0.001)).toBe('0');
    expect(roundQtyToStep(-1, 0.001)).toBe('0');
    expect(roundQtyToStep(Number.NaN, 0.001)).toBe('0');
  });
});

const info: ExchangeInfo = {
  symbols: [
    {
      symbol: 'BTCUSDT',
      filters: [
        { filterType: 'LOT_SIZE', stepSize: '0.001', minQty: '0.001' },
        { filterType: 'MIN_NOTIONAL', notional: '100' },
      ],
    },
  ],
};

describe('extractSymbolRules', () => {
  it('LOT_SIZE·MIN_NOTIONAL을 뽑는다', () => {
    expect(extractSymbolRules(info, 'BTCUSDT')).toEqual({
      stepSize: 0.001,
      minQty: 0.001,
      minNotional: 100,
    });
  });

  it('없는 심볼이면 throw', () => {
    expect(() => extractSymbolRules(info, 'ETHUSDT')).toThrow(/ETHUSDT/);
  });
});

describe('computeEntryQty', () => {
  const rules = { stepSize: 0.001, minQty: 0.001, minNotional: 100 };

  it('증거금 × 레버리지 / 가격 으로 수량을 낸다', () => {
    // 잔고 10000의 10% = 1000 증거금, 3x → 명목 3000, 가격 30000 → 0.1
    const result = computeEntryQty({
      availableUsdt: 10_000,
      positionSizePct: 10,
      leverage: 3,
      price: 30_000,
      rules,
    });
    expect(result).toEqual({ ok: true, qty: '0.100' });
  });

  it('잔고가 없으면 거절', () => {
    const result = computeEntryQty({
      availableUsdt: 0,
      positionSizePct: 10,
      leverage: 3,
      price: 30_000,
      rules,
    });
    expect(result.ok).toBe(false);
  });

  it('최소 명목가치 미달이면 사유를 준다', () => {
    // 잔고 300의 10% = 30 증거금, 1x → 명목 30, 가격 30000 → 수량 0.001
    // 수량은 minQty(0.001)를 만족하지만 명목가치 30 < minNotional 100 이라 거절되어야 한다.
    const result = computeEntryQty({
      availableUsdt: 300,
      positionSizePct: 10,
      leverage: 1,
      price: 30_000,
      rules,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('최소 주문 금액');
  });

  it('수량이 최소 단위 미만이면 거절', () => {
    const result = computeEntryQty({
      availableUsdt: 1,
      positionSizePct: 1,
      leverage: 1,
      price: 100_000,
      rules,
    });
    expect(result.ok).toBe(false);
  });

  it('가격이 유효하지 않으면 거절', () => {
    const result = computeEntryQty({
      availableUsdt: 10_000,
      positionSizePct: 10,
      leverage: 3,
      price: 0,
      rules,
    });
    expect(result.ok).toBe(false);
  });
});
