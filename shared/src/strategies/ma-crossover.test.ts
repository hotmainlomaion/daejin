import { describe, expect, it } from 'vitest';
import { evaluateMaCrossover, validateMaCrossoverParams } from './ma-crossover.ts';
import type { Candle, MaCrossoverParams, Position } from '../types.ts';

/** 종가 배열을 캔들 배열로. 교차 판정은 종가만 쓰므로 나머지는 종가로 채운다. */
function candlesFromCloses(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    openTime: i * 60_000,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
    closeTime: (i + 1) * 60_000 - 1,
  }));
}

const params: MaCrossoverParams = {
  symbol: 'BTCUSDT',
  timeframe: '15m',
  leverage: 3,
  positionSizePct: 10,
  stopLossPct: 2,
  takeProfitPct: 4,
  fastPeriod: 2,
  slowPeriod: 4,
  maType: 'SMA',
  onDeadCross: 'SHORT',
};

/**
 * 골든크로스가 나는 시퀀스.
 * 하락 후 급반등시켜 마지막 캔들에서 단기 SMA(2)가 장기 SMA(4)를 상향 교차하게 만든다.
 *
 * closes: [10, 9, 8, 7, 6, 20]
 *   직전(=마지막 제외 [10,9,8,7,6]): fast=sma(7,6)=6.5, slow=sma(9,8,7,6)=7.5 → fast < slow
 *   현재([10,9,8,7,6,20]):          fast=sma(6,20)=13,  slow=sma(8,7,6,20)=10.25 → fast > slow
 */
const goldenCrossCloses = [10, 9, 8, 7, 6, 20];

/**
 * 데드크로스가 나는 시퀀스 (위의 대칭).
 *   직전([1,2,3,4,5]): fast=sma(4,5)=4.5, slow=sma(2,3,4,5)=3.5 → fast > slow
 *   현재([1,2,3,4,5,0]): fast=sma(5,0)=2.5, slow=sma(3,4,5,0)=3 → fast < slow
 */
const deadCrossCloses = [1, 2, 3, 4, 5, 0];

describe('validateMaCrossoverParams', () => {
  it('fast >= slow 이면 유효하지 않다', () => {
    expect(validateMaCrossoverParams({ ...params, fastPeriod: 25, slowPeriod: 7 })).not.toBeNull();
    expect(validateMaCrossoverParams({ ...params, fastPeriod: 7, slowPeriod: 7 })).not.toBeNull();
  });

  it('정상 파라미터는 null', () => {
    expect(validateMaCrossoverParams(params)).toBeNull();
  });

  it('기간이 정수가 아니거나 1 미만이면 유효하지 않다', () => {
    expect(validateMaCrossoverParams({ ...params, fastPeriod: 0 })).not.toBeNull();
    expect(validateMaCrossoverParams({ ...params, fastPeriod: 1.5 })).not.toBeNull();
  });
});

describe('evaluateMaCrossover', () => {
  it('캔들 수가 slowPeriod + 1 미만이면 HOLD', () => {
    const candles = candlesFromCloses([1, 2, 3, 4]); // slowPeriod=4 → 5개 필요
    const signal = evaluateMaCrossover(candles, params, null);
    expect(signal.action).toBe('HOLD');
    expect(signal.reason).toContain('캔들 부족');
  });

  it('파라미터가 유효하지 않으면 평가하지 않고 HOLD', () => {
    const candles = candlesFromCloses(goldenCrossCloses);
    const signal = evaluateMaCrossover(candles, { ...params, fastPeriod: 4, slowPeriod: 2 }, null);
    expect(signal.action).toBe('HOLD');
  });

  it('교차가 없으면 HOLD', () => {
    // 단조 증가 — fast가 계속 slow 위에 있어 교차가 없다
    const candles = candlesFromCloses([1, 2, 3, 4, 5, 6]);
    const signal = evaluateMaCrossover(candles, params, null);
    expect(signal.action).toBe('HOLD');
    expect(signal.reason).toBe('교차 없음');
  });

  describe('골든크로스', () => {
    it('포지션이 없으면 LONG', () => {
      const candles = candlesFromCloses(goldenCrossCloses);
      const signal = evaluateMaCrossover(candles, params, null);
      expect(signal.action).toBe('LONG');
    });

    it('이미 롱이면 중복 진입하지 않는다', () => {
      const candles = candlesFromCloses(goldenCrossCloses);
      // 손절/익절에 걸리지 않도록 진입가를 마지막 종가와 같게 둔다
      const position: Position = { side: 'LONG', entryPrice: 20, qty: 1 };
      const signal = evaluateMaCrossover(candles, params, position);
      expect(signal.action).toBe('HOLD');
      expect(signal.reason).toContain('이미 롱');
    });

    it('숏 보유 중이면 청산만 하고 재진입은 다음 평가로 미룬다', () => {
      const candles = candlesFromCloses(goldenCrossCloses);
      // 손절이 먼저 걸리지 않도록 stopLoss를 끈다
      const noStop = { ...params, stopLossPct: 0, takeProfitPct: 0 };
      const position: Position = { side: 'SHORT', entryPrice: 20, qty: 1 };
      const signal = evaluateMaCrossover(candles, noStop, position);
      expect(signal.action).toBe('CLOSE');
    });
  });

  describe('데드크로스', () => {
    it('포지션이 없고 onDeadCross=SHORT 면 SHORT', () => {
      const candles = candlesFromCloses(deadCrossCloses);
      const signal = evaluateMaCrossover(candles, params, null);
      expect(signal.action).toBe('SHORT');
    });

    it('onDeadCross=CLOSE_ONLY 면 신규 진입하지 않는다', () => {
      const candles = candlesFromCloses(deadCrossCloses);
      const signal = evaluateMaCrossover(candles, { ...params, onDeadCross: 'CLOSE_ONLY' }, null);
      expect(signal.action).toBe('HOLD');
    });

    it('롱 보유 중이면 CLOSE', () => {
      const candles = candlesFromCloses(deadCrossCloses);
      const noStop = { ...params, stopLossPct: 0, takeProfitPct: 0 };
      const position: Position = { side: 'LONG', entryPrice: 0.001, qty: 1 };
      const signal = evaluateMaCrossover(candles, noStop, position);
      expect(signal.action).toBe('CLOSE');
    });
  });

  describe('리스크 관리 우선', () => {
    it('손절이 걸리면 교차 신호보다 우선한다', () => {
      // 골든크로스 시퀀스지만 숏 포지션이 크게 손실 중 → 손절 CLOSE가 먼저
      const candles = candlesFromCloses(goldenCrossCloses); // 마지막 종가 20
      const position: Position = { side: 'SHORT', entryPrice: 10, qty: 1 };
      const signal = evaluateMaCrossover(candles, params, position);
      expect(signal.action).toBe('CLOSE');
      expect(signal.reason).toContain('손절');
    });

    it('익절이 걸리면 교차 신호보다 우선한다', () => {
      // 데드크로스 시퀀스(마지막 종가 0)에 숏 보유 → 크게 이익 → 익절
      const candles = candlesFromCloses([1, 2, 3, 4, 5, 0.5]);
      const position: Position = { side: 'SHORT', entryPrice: 5, qty: 1 };
      const signal = evaluateMaCrossover(candles, params, position);
      expect(signal.action).toBe('CLOSE');
      expect(signal.reason).toContain('익절');
    });
  });
});
