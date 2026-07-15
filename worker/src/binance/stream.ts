/**
 * 테스트넷 kline WebSocket 구독.
 *
 * MVP는 **캔들 종가 확정 시에만** 평가한다 (PRD §5.1, strategy-templates.md).
 * 따라서 payload의 k.x === true 인 이벤트만 콜백으로 넘긴다.
 *
 * 봇은 24시간 돌아야 하므로 끊기면 지수 백오프로 재연결한다 (README 아키텍처 제약).
 */
import WebSocket from 'ws';
import type { Candle } from '@futureslab/shared';
import { log } from '../logger.ts';

/** 바이낸스 kline 스트림 payload에서 우리가 쓰는 필드만. */
interface KlineEvent {
  e: string;
  k: {
    t: number; // 캔들 시작
    T: number; // 캔들 종료
    o: string;
    h: string;
    l: string;
    c: string;
    v: string;
    x: boolean; // 캔들 확정 여부
  };
}

export interface KlineStreamOptions {
  wsBase: string;
  symbol: string;
  interval: string;
  /** 종가가 확정된 캔들만 전달된다. */
  onClosedCandle: (candle: Candle) => void;
}

const MAX_BACKOFF_MS = 30_000;
/** 바이낸스는 일정 시간 무응답이면 연결을 끊는다. 그보다 짧게 살아있는지 확인한다. */
const STALE_TIMEOUT_MS = 90_000;

export class KlineStream {
  private ws: WebSocket | null = null;
  private backoffMs = 1_000;
  private stopped = false;
  private staleTimer: NodeJS.Timeout | null = null;
  private readonly opts: KlineStreamOptions;

  constructor(opts: KlineStreamOptions) {
    this.opts = opts;
  }

  private get streamUrl(): string {
    // 스트림 이름은 소문자여야 한다: btcusdt@kline_15m
    const stream = `${this.opts.symbol.toLowerCase()}@kline_${this.opts.interval}`;
    // TODO(confirm): 테스트넷의 단일 스트림 경로가 /ws 인지 확인 필요.
    // 프로덕션은 2026-04-23부터 /ws가 폐기되고 /market 계열로 바뀌었으나,
    // 공식 공지가 테스트넷을 다루지 않는다. week1.md Day 0에서 실측할 것.
    return `${this.opts.wsBase}/ws/${stream}`;
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearStaleTimer();
    // close()는 onclose를 부르는데, stopped 플래그 때문에 재연결하지 않는다.
    this.ws?.close();
    this.ws = null;
  }

  private connect(): void {
    if (this.stopped) return;

    const ws = new WebSocket(this.streamUrl);
    this.ws = ws;

    ws.on('open', () => {
      log.info(`WS 연결됨: ${this.opts.symbol} ${this.opts.interval}`);
      this.backoffMs = 1_000; // 성공했으니 백오프 초기화
      this.resetStaleTimer();
    });

    ws.on('message', (raw: Buffer) => {
      this.resetStaleTimer();
      let event: KlineEvent;
      try {
        event = JSON.parse(raw.toString()) as KlineEvent;
      } catch {
        return; // 해석 불가한 프레임은 버린다
      }
      if (!event.k) return;
      // 확정되지 않은 캔들은 무시 — MVP는 tick 단위가 아니다.
      if (!event.k.x) return;

      this.opts.onClosedCandle({
        openTime: event.k.t,
        open: Number.parseFloat(event.k.o),
        high: Number.parseFloat(event.k.h),
        low: Number.parseFloat(event.k.l),
        close: Number.parseFloat(event.k.c),
        volume: Number.parseFloat(event.k.v),
        closeTime: event.k.T,
      });
    });

    ws.on('error', (err: Error) => {
      log.warn(`WS 오류 (${this.opts.symbol}): ${err.message}`);
    });

    ws.on('close', () => {
      this.clearStaleTimer();
      if (this.stopped) return;
      log.warn(`WS 끊김 (${this.opts.symbol}) — ${this.backoffMs}ms 후 재연결`);
      setTimeout(() => this.connect(), this.backoffMs);
      this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    });
  }

  /**
   * 조용히 죽은 연결(응답 없는 소켓) 감지.
   * close 이벤트가 안 오는 경우가 있어 타임아웃으로 강제 재연결한다.
   */
  private resetStaleTimer(): void {
    this.clearStaleTimer();
    this.staleTimer = setTimeout(() => {
      log.warn(`WS 무응답 ${STALE_TIMEOUT_MS}ms (${this.opts.symbol}) — 강제 재연결`);
      this.ws?.terminate();
    }, STALE_TIMEOUT_MS);
  }

  private clearStaleTimer(): void {
    if (this.staleTimer) {
      clearTimeout(this.staleTimer);
      this.staleTimer = null;
    }
  }
}
