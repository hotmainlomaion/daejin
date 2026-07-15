/**
 * 전략 평가에 쓰이는 공용 타입.
 * 웹앱·워커가 같은 정의를 공유해서 파라미터 해석이 어긋나지 않게 한다.
 */

/** 확정된 캔들 하나. 평가는 항상 종가 확정분으로만 한다 (strategy-templates.md). */
export interface Candle {
  /** 캔들 시작 시각 (epoch ms) */
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** 캔들 종료 시각 (epoch ms) */
  closeTime: number;
}

/**
 * 전략 평가 결과.
 * - LONG/SHORT: 신규 진입
 * - CLOSE: 보유 포지션 청산
 * - HOLD: 아무것도 하지 않음 (데이터 부족·조건 미충족 포함)
 */
export type SignalAction = 'LONG' | 'SHORT' | 'CLOSE' | 'HOLD';

export interface Signal {
  action: SignalAction;
  /** 로그·대시보드에 그대로 노출되는 한국어 사유. 시크릿을 넣지 않는다. */
  reason: string;
}

/**
 * 봇 이벤트의 종류. SignalAction에 'ERROR'를 더한 것으로,
 * 시그널로 표현되지 않는 워커 측 오류까지 화면에 남기기 위함이다.
 * DB의 public.bot_event_action enum과 값이 일치해야 한다.
 */
export type BotEventAction = SignalAction | 'ERROR';

/**
 * 봇이 캔들을 평가할 때마다 남기는 판단 근거 한 건 (DB: public.bot_events).
 * 체결이 없어도 기록되므로, 유저는 이걸로 봇이 살아있는지 확인한다.
 */
export interface BotEvent {
  id: string;
  botId: string;
  action: BotEventAction;
  /** 한국어 사유. 전략의 Signal.reason이 그대로 들어온다. */
  reason: string;
  /** 평가 시점의 확정 종가. 가격을 알 수 없는 경우 null. */
  price: number | null;
  /** 기록 시각 (ISO 8601 문자열) */
  createdAt: string;
}

/** 현재 보유 포지션. 없으면 null. */
export interface Position {
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  qty: number;
}

/** 전 템플릿 공통 파라미터 (strategy-templates.md §공통). */
export interface CommonParams {
  symbol: string;
  timeframe: string;
  leverage: number;
  /** 진입 규모 (잔고 %) */
  positionSizePct: number;
  /** 손절 (%) — 진입가 대비 */
  stopLossPct: number;
  /** 익절 (%) — 진입가 대비 */
  takeProfitPct: number;
}

/** 이평선 교차 고유 파라미터 (strategy-templates.md §2). */
export interface MaCrossoverParams extends CommonParams {
  fastPeriod: number;
  slowPeriod: number;
  maType: 'SMA' | 'EMA';
  /** 데드크로스 시 SHORT 진입할지, 롱 청산만 할지 — 유저 설정. */
  onDeadCross: 'SHORT' | 'CLOSE_ONLY';
}

/**
 * 모든 전략이 따르는 인터페이스 (strategy-templates.md §구현 노트).
 * 입력: 캔들 배열 + 파라미터 (+ 현재 포지션) → 출력: 시그널. 부수효과 없음.
 */
export type Evaluate<P extends CommonParams> = (
  candles: readonly Candle[],
  params: P,
  position: Position | null,
) => Signal;
