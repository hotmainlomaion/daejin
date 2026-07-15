import { describe, expect, it } from 'vitest';
import { checkStopLossTakeProfit } from './risk.ts';
import type { Position } from './types.ts';

const params = { stopLossPct: 2, takeProfitPct: 4 };
const long: Position = { side: 'LONG', entryPrice: 100, qty: 1 };
const short: Position = { side: 'SHORT', entryPrice: 100, qty: 1 };

describe('checkStopLossTakeProfit', () => {
  it('포지션이 없으면 null', () => {
    expect(checkStopLossTakeProfit(100, null, params)).toBeNull();
  });

  it('손익이 구간 안이면 null', () => {
    expect(checkStopLossTakeProfit(101, long, params)).toBeNull();
    expect(checkStopLossTakeProfit(99, short, params)).toBeNull();
  });

  describe('LONG', () => {
    it('가격이 손절선까지 내려가면 CLOSE', () => {
      expect(checkStopLossTakeProfit(98, long, params)?.action).toBe('CLOSE');
    });

    it('가격이 익절선까지 올라가면 CLOSE', () => {
      expect(checkStopLossTakeProfit(104, long, params)?.action).toBe('CLOSE');
    });

    it('손절선 경계값(정확히 -2%)도 발동한다', () => {
      const signal = checkStopLossTakeProfit(98, long, params);
      expect(signal?.action).toBe('CLOSE');
      expect(signal?.reason).toContain('손절');
    });
  });

  describe('SHORT', () => {
    it('부호가 뒤집힌다 — 가격이 오르면 손절', () => {
      const signal = checkStopLossTakeProfit(102, short, params);
      expect(signal?.action).toBe('CLOSE');
      expect(signal?.reason).toContain('손절');
    });

    it('가격이 내려가면 익절', () => {
      const signal = checkStopLossTakeProfit(96, short, params);
      expect(signal?.action).toBe('CLOSE');
      expect(signal?.reason).toContain('익절');
    });
  });

  it('손절·익절이 동시에 걸리면 보수적으로 손절을 우선한다', () => {
    // stopLoss 1% / takeProfit 1%로 두고 -5% 상황을 만들면 둘 다 조건 성립
    const both = { stopLossPct: 1, takeProfitPct: 1 };
    const signal = checkStopLossTakeProfit(95, long, both);
    expect(signal?.reason).toContain('손절');
  });

  it('stopLossPct=0 이면 아무리 손실이어도 손절하지 않는다', () => {
    expect(checkStopLossTakeProfit(50, long, { stopLossPct: 0, takeProfitPct: 4 })).toBeNull();
  });

  it('takeProfitPct=0 이면 아무리 수익이어도 익절하지 않는다', () => {
    expect(checkStopLossTakeProfit(200, long, { stopLossPct: 2, takeProfitPct: 0 })).toBeNull();
  });

  it('비정상 가격은 무시한다', () => {
    expect(checkStopLossTakeProfit(0, long, params)).toBeNull();
    expect(checkStopLossTakeProfit(Number.NaN, long, params)).toBeNull();
  });
});
