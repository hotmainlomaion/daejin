/**
 * 바이낸스 테스트넷 REST 클라이언트 (USD-M 선물).
 *
 * 서명 방식: totalParams(쿼리스트링)를 secretKey로 HMAC SHA256 → signature 파라미터로 첨부,
 * API 키는 X-MBX-APIKEY 헤더. (developers.binance.com 공식 문서 기준)
 *
 * ⚠️ 베이스 URL은 config.ts가 테스트넷 화이트리스트로 검증한 값만 들어온다.
 */
import { createHmac } from 'node:crypto';
import type { Candle } from '@futureslab/shared';

export interface BinanceCredentials {
  apiKey: string;
  secret: string;
}

// 주의: Node의 타입 스트리핑(strip-only)은 파라미터 프로퍼티
// (constructor(private readonly x: T))를 지원하지 않는다. 필드를 명시적으로 선언한다.
export class BinanceApiError extends Error {
  readonly status: number;
  readonly code: number | undefined;

  constructor(message: string, status: number, code?: number) {
    super(message);
    this.name = 'BinanceApiError';
    this.status = status;
    this.code = code;
  }
}

type Params = Record<string, string | number | boolean | undefined>;

export class BinanceTestnetClient {
  private readonly baseUrl: string;
  /** 복호화된 키. 이 객체 밖으로 나가지 않으며 로그에도 찍지 않는다 (가드레일 6·8). */
  private readonly creds: BinanceCredentials;

  constructor(baseUrl: string, creds: BinanceCredentials) {
    this.baseUrl = baseUrl;
    this.creds = creds;
  }

  /** 서명이 필요 없는 공개 엔드포인트 호출. */
  private async publicGet<T>(path: string, params: Params = {}): Promise<T> {
    const qs = toQueryString(params);
    const url = `${this.baseUrl}${path}${qs ? `?${qs}` : ''}`;
    const res = await fetch(url);
    return this.parse<T>(res);
  }

  /** 서명이 필요한 엔드포인트 호출. */
  private async signedRequest<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    params: Params = {},
  ): Promise<T> {
    // TODO(confirm): recvWindow 기본 5000ms. 워커-바이낸스 시계 차가 크면 -1021이 난다.
    // Day 0에서 실제 지연을 보고 조정할 것.
    const withMeta: Params = { ...params, timestamp: Date.now(), recvWindow: 5000 };
    const totalParams = toQueryString(withMeta);
    const signature = createHmac('sha256', this.creds.secret).update(totalParams).digest('hex');
    const url = `${this.baseUrl}${path}?${totalParams}&signature=${signature}`;

    const res = await fetch(url, {
      method,
      headers: { 'X-MBX-APIKEY': this.creds.apiKey },
    });
    return this.parse<T>(res);
  }

  private async parse<T>(res: Response): Promise<T> {
    const text = await res.text();
    if (!res.ok) {
      // 바이낸스 에러 형식: {"code":-2019,"msg":"Margin is insufficient."}
      let code: number | undefined;
      let msg = text;
      try {
        const body = JSON.parse(text) as { code?: number; msg?: string };
        code = body.code;
        msg = body.msg ?? text;
      } catch {
        // 본문이 JSON이 아니면 원문을 그대로 쓴다
      }
      // ⚠️ 에러 메시지에 서명·키가 들어가지 않게 URL은 절대 포함하지 않는다 (가드레일 8).
      throw new BinanceApiError(`바이낸스 API 오류 (${res.status}): ${msg}`, res.status, code);
    }
    return JSON.parse(text) as T;
  }

  /** 심볼 거래 규칙 (수량·가격 precision). 주문 전 반올림에 쓴다. */
  async exchangeInfo(): Promise<ExchangeInfo> {
    return this.publicGet<ExchangeInfo>('/fapi/v1/exchangeInfo');
  }

  /** 과거 캔들. 워커 기동 시 지표 계산용 워밍업 데이터를 채운다. */
  async klines(symbol: string, interval: string, limit = 200): Promise<Candle[]> {
    const raw = await this.publicGet<RawKline[]>('/fapi/v1/klines', { symbol, interval, limit });
    return raw.map(parseRestKline);
  }

  /** 레버리지 설정. 봇 시작 시 1회. */
  async setLeverage(symbol: string, leverage: number): Promise<void> {
    await this.signedRequest('POST', '/fapi/v1/leverage', { symbol, leverage });
  }

  /** 시장가 주문. MVP는 캔들 종가 기준이라 지정가를 쓰지 않는다. */
  async marketOrder(args: {
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: string;
    reduceOnly?: boolean;
  }): Promise<OrderResponse> {
    return this.signedRequest<OrderResponse>('POST', '/fapi/v1/order', {
      symbol: args.symbol,
      side: args.side,
      type: 'MARKET',
      quantity: args.quantity,
      ...(args.reduceOnly ? { reduceOnly: 'true' } : {}),
    });
  }

  /** 현재 포지션. 청산가·미실현손익은 테스트넷이 계산한 값을 그대로 읽는다. */
  async positionRisk(symbol: string): Promise<PositionRisk[]> {
    return this.signedRequest<PositionRisk[]>('GET', '/fapi/v2/positionRisk', { symbol });
  }

  /** 계정 잔고 (USDT). 진입 규모 계산에 쓴다. */
  async availableUsdt(): Promise<number> {
    const balances = await this.signedRequest<Balance[]>('GET', '/fapi/v2/balance');
    const usdt = balances.find((b) => b.asset === 'USDT');
    return usdt ? Number.parseFloat(usdt.availableBalance) : 0;
  }

  /** 펀딩비 등 손익 이력. 실현손익·펀딩비 집계에 쓴다. */
  async income(symbol: string, startTime: number): Promise<IncomeRecord[]> {
    return this.signedRequest<IncomeRecord[]>('GET', '/fapi/v1/income', {
      symbol,
      startTime,
      limit: 1000,
    });
  }
}

/**
 * 쿼리스트링 생성.
 * ⚠️ 바이낸스 서명은 **문자열 그대로**를 HMAC 대상으로 삼으므로,
 * 서명할 때와 보낼 때의 순서·인코딩이 반드시 같아야 한다. 그래서 한 함수에서만 만든다.
 */
function toQueryString(params: Params): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
}

/** REST /fapi/v1/klines 응답은 배열의 배열이다. */
type RawKline = [
  openTime: number,
  open: string,
  high: string,
  low: string,
  close: string,
  volume: string,
  closeTime: number,
  ...rest: unknown[],
];

function parseRestKline(k: RawKline): Candle {
  return {
    openTime: k[0],
    open: Number.parseFloat(k[1]),
    high: Number.parseFloat(k[2]),
    low: Number.parseFloat(k[3]),
    close: Number.parseFloat(k[4]),
    volume: Number.parseFloat(k[5]),
    closeTime: k[6],
  };
}

export interface ExchangeInfo {
  symbols: {
    symbol: string;
    filters: { filterType: string; stepSize?: string; minQty?: string; notional?: string }[];
  }[];
}

export interface OrderResponse {
  orderId: number;
  symbol: string;
  status: string;
  /** 체결 평균가. MARKET 주문이 즉시 체결되면 채워진다. */
  avgPrice: string;
  executedQty: string;
  side: 'BUY' | 'SELL';
  updateTime: number;
}

export interface PositionRisk {
  symbol: string;
  /** 양수=롱, 음수=숏, 0=포지션 없음 */
  positionAmt: string;
  entryPrice: string;
  unRealizedProfit: string;
  liquidationPrice: string;
  leverage: string;
}

interface Balance {
  asset: string;
  availableBalance: string;
}

export interface IncomeRecord {
  symbol: string;
  incomeType: string;
  income: string;
  time: number;
}
