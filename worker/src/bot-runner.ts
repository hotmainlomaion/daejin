/**
 * 봇 하나의 실행 루프 — 이 제품의 심장 (PRD §5.1).
 *
 * 흐름:
 *   1. 워밍업: REST로 과거 캔들을 받아 지표 계산 준비
 *   2. kline WS 구독 → 캔들 종가 확정 이벤트
 *   3. 테스트넷에서 현재 포지션 조회 (신뢰 원천은 DB가 아니라 거래소)
 *   4. 전략 순수 함수 평가
 *   5. 시그널대로 테스트넷 주문 → trades·positions 기록
 *
 * 포지션 상태를 워커 메모리에 캐시하지 않고 매번 테스트넷에 묻는다.
 * 워커가 재시작해도 상태가 복구되는 게 이 방식의 이유다 (week1.md Day 7).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  evaluateMaCrossover,
  type Candle,
  type MaCrossoverParams,
  type Position,
  type Signal,
} from '@futureslab/shared';
import { decryptSecret } from '@futureslab/shared/crypto';
import { BinanceApiError, BinanceTestnetClient } from './binance/rest.ts';
import { computeEntryQty, extractSymbolRules, roundQtyToStep, type SymbolRules } from './binance/precision.ts';
import { KlineStream } from './binance/stream.ts';
import {
  deletePosition,
  fetchExchangeKey,
  fetchStrategy,
  insertTrade,
  markBotError,
  upsertPosition,
  type BotRow,
} from './db.ts';
import type { WorkerConfig } from './config.ts';
import { log } from './logger.ts';

/** 지표 워밍업용 과거 캔들 수. slowPeriod 최대치를 넉넉히 덮는다. */
const WARMUP_CANDLES = 200;

export class BotRunner {
  private stream: KlineStream | null = null;
  private candles: Candle[] = [];
  private rules: SymbolRules | null = null;
  private client: BinanceTestnetClient | null = null;
  private params: MaCrossoverParams | null = null;
  /** 한 캔들 처리가 끝나기 전에 다음 캔들이 오면 겹치지 않게 막는다. */
  private busy = false;
  private stopped = false;
  private readonly bot: BotRow;
  private readonly db: SupabaseClient;
  private readonly config: WorkerConfig;

  constructor(bot: BotRow, db: SupabaseClient, config: WorkerConfig) {
    this.bot = bot;
    this.db = db;
    this.config = config;
  }

  get botId(): string {
    return this.bot.id;
  }

  async start(): Promise<void> {
    try {
      await this.bootstrap();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      log.error(`봇 ${this.bot.id} 기동 실패`, err);
      await markBotError(this.db, this.bot.id, reason);
      return;
    }

    this.stream = new KlineStream({
      wsBase: this.config.binanceWsBase,
      symbol: this.bot.symbol,
      interval: this.bot.timeframe,
      onClosedCandle: (candle) => {
        void this.onClosedCandle(candle);
      },
    });
    this.stream.start();
    log.info(`봇 ${this.bot.id} 시작 (${this.bot.symbol} ${this.bot.timeframe})`);
  }

  stop(): void {
    this.stopped = true;
    this.stream?.stop();
    this.stream = null;
    log.info(`봇 ${this.bot.id} 정지`);
  }

  /** 키 복호화 → 클라이언트 준비 → 전략 파라미터 로드 → 워밍업 캔들 확보. */
  private async bootstrap(): Promise<void> {
    const strategy = await fetchStrategy(this.db, this.bot.strategy_id);
    if (strategy.template_type !== 'ma_crossover') {
      // MVP는 이평선 교차만 (week1.md Day 2). 나머지 2종은 Day 6.
      throw new Error(`아직 지원하지 않는 전략입니다: ${strategy.template_type}`);
    }

    this.params = {
      ...(strategy.params as unknown as MaCrossoverParams),
      symbol: this.bot.symbol,
      timeframe: this.bot.timeframe,
      leverage: this.bot.leverage,
    };

    const keyRow = await fetchExchangeKey(this.db, this.bot.exchange_key_id);
    // 복호화는 워커에서만 (가드레일 6). 복호화된 값은 이 객체 밖으로 나가지 않는다.
    const apiKey = decryptSecret(keyRow.encrypted_api_key, this.config.encryptionKey);
    const secret = decryptSecret(keyRow.encrypted_secret, this.config.encryptionKey);

    this.client = new BinanceTestnetClient(this.config.binanceRestBase, { apiKey, secret });

    const info = await this.client.exchangeInfo();
    this.rules = extractSymbolRules(info, this.bot.symbol);

    await this.client.setLeverage(this.bot.symbol, this.bot.leverage);

    this.candles = await this.client.klines(this.bot.symbol, this.bot.timeframe, WARMUP_CANDLES);
    log.info(`봇 ${this.bot.id} 워밍업 완료 (캔들 ${this.candles.length}개)`);
  }

  private async onClosedCandle(candle: Candle): Promise<void> {
    if (this.stopped || this.busy) return;
    this.busy = true;
    try {
      this.appendCandle(candle);

      const position = await this.fetchPosition();
      const signal = evaluateMaCrossover(this.candles, this.params!, position);

      if (signal.action !== 'HOLD') {
        log.info(`봇 ${this.bot.id} 시그널: ${signal.action} — ${signal.reason}`);
      }

      await this.executeSignal(signal, position, candle.close);
      await this.syncPosition();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      log.error(`봇 ${this.bot.id} 평가 실패`, err);
      // 주문 거절(잔고 부족 등)로 봇 전체를 죽이지는 않는다. 다음 캔들에서 다시 시도한다.
      // 인증 오류처럼 복구 불가한 것만 봇을 내린다.
      if (err instanceof BinanceApiError && isFatal(err)) {
        await markBotError(this.db, this.bot.id, reason);
        this.stop();
      }
    } finally {
      this.busy = false;
    }
  }

  /** 같은 캔들이 중복 오면 갱신하고, 새 캔들이면 덧붙인다. */
  private appendCandle(candle: Candle): void {
    const last = this.candles[this.candles.length - 1];
    if (last && last.openTime === candle.openTime) {
      this.candles[this.candles.length - 1] = candle;
      return;
    }
    this.candles.push(candle);
    if (this.candles.length > WARMUP_CANDLES) {
      this.candles = this.candles.slice(-WARMUP_CANDLES);
    }
  }

  /** 신뢰 원천은 테스트넷이다. 워커 메모리를 믿지 않는다. */
  private async fetchPosition(): Promise<Position | null> {
    const risks = await this.client!.positionRisk(this.bot.symbol);
    const risk = risks.find((r) => r.symbol === this.bot.symbol);
    if (!risk) return null;

    const amt = Number.parseFloat(risk.positionAmt);
    if (amt === 0) return null;

    return {
      side: amt > 0 ? 'LONG' : 'SHORT',
      entryPrice: Number.parseFloat(risk.entryPrice),
      qty: Math.abs(amt),
    };
  }

  private async executeSignal(
    signal: Signal,
    position: Position | null,
    price: number,
  ): Promise<void> {
    switch (signal.action) {
      case 'HOLD':
        return;

      case 'CLOSE': {
        if (!position) return;
        // reduceOnly로 청산 — 반대 방향 신규 포지션이 열리는 것을 막는다.
        const side = position.side === 'LONG' ? 'SELL' : 'BUY';
        const qty = roundQtyToStep(position.qty, this.rules!.stepSize);
        const order = await this.client!.marketOrder({
          symbol: this.bot.symbol,
          side,
          quantity: qty,
          reduceOnly: true,
        });
        await this.recordTrade(order, price);
        return;
      }

      case 'LONG':
      case 'SHORT': {
        if (position) return; // 이미 포지션이 있으면 신규 진입하지 않는다
        const available = await this.client!.availableUsdt();
        const computed = computeEntryQty({
          availableUsdt: available,
          positionSizePct: this.params!.positionSizePct,
          leverage: this.bot.leverage,
          price,
          rules: this.rules!,
        });
        if (!computed.ok) {
          log.warn(`봇 ${this.bot.id} 진입 건너뜀: ${computed.reason}`);
          return;
        }
        const order = await this.client!.marketOrder({
          symbol: this.bot.symbol,
          side: signal.action === 'LONG' ? 'BUY' : 'SELL',
          quantity: computed.qty,
        });
        await this.recordTrade(order, price);
        return;
      }
    }
  }

  private async recordTrade(
    order: { orderId: number; side: 'BUY' | 'SELL'; avgPrice: string; executedQty: string },
    fallbackPrice: number,
  ): Promise<void> {
    // MARKET 주문이라 보통 avgPrice가 채워지지만, 0이면 캔들 종가로 대체한다.
    const avg = Number.parseFloat(order.avgPrice);
    await insertTrade(this.db, {
      bot_id: this.bot.id,
      side: order.side,
      price: avg > 0 ? avg : fallbackPrice,
      qty: Number.parseFloat(order.executedQty),
      exchange_order_id: String(order.orderId),
    });
  }

  /** 테스트넷이 계산한 포지션·미실현손익·청산가를 그대로 DB에 반영한다 (PRD §5.1). */
  private async syncPosition(): Promise<void> {
    const risks = await this.client!.positionRisk(this.bot.symbol);
    const risk = risks.find((r) => r.symbol === this.bot.symbol);
    const amt = risk ? Number.parseFloat(risk.positionAmt) : 0;

    if (!risk || amt === 0) {
      await deletePosition(this.db, this.bot.id, this.bot.symbol);
      return;
    }

    const liq = Number.parseFloat(risk.liquidationPrice);
    await upsertPosition(this.db, {
      bot_id: this.bot.id,
      symbol: this.bot.symbol,
      entry_price: Number.parseFloat(risk.entryPrice),
      qty: amt,
      unrealized_pnl: Number.parseFloat(risk.unRealizedProfit),
      // 청산가 0은 "청산가 없음"을 뜻한다.
      liquidation_price: Number.isFinite(liq) && liq > 0 ? liq : null,
    });
  }
}

/**
 * 재시도해도 소용없는 오류인지.
 * 인증·권한 문제는 봇을 내려서 유저가 키를 고치게 한다.
 * 잔고 부족(-2019)처럼 일시적인 건 다음 캔들에서 다시 시도한다.
 */
function isFatal(err: BinanceApiError): boolean {
  if (err.status === 401 || err.status === 403) return true;
  // -2015: 잘못된 API 키/권한, -2014: 잘못된 키 포맷, -1022: 서명 불일치
  return err.code === -2015 || err.code === -2014 || err.code === -1022;
}
