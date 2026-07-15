export type {
  Candle,
  CommonParams,
  Evaluate,
  MaCrossoverParams,
  Position,
  Signal,
  SignalAction,
} from './types.ts';

export { ema, movingAverage, sma } from './indicators.ts';
export { checkStopLossTakeProfit } from './risk.ts';
export { evaluateMaCrossover, validateMaCrossoverParams } from './strategies/ma-crossover.ts';

/** 템플릿 기본값 (strategy-templates.md). 어디까지나 시작점이며 플랫폼이 권장하는 값이 아니다. */
export const MA_CROSSOVER_DEFAULTS = {
  symbol: 'BTCUSDT',
  timeframe: '15m',
  leverage: 3,
  positionSizePct: 10,
  stopLossPct: 2,
  takeProfitPct: 4,
  fastPeriod: 7,
  slowPeriod: 25,
  maType: 'EMA',
  onDeadCross: 'CLOSE_ONLY',
} as const;
