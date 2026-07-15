/**
 * 차트 지표 카탈로그 — 바이낸스 차트가 제공하는 지표 세트.
 *
 * 바이낸스 자체 지표 메뉴를 기준으로 삼았다. TradingView의 100+ 지표가 아니라
 * "바이낸스가 제공하는" 것이 기준이다.
 *  - 메인(가격 위 오버레이): MA, EMA, WMA, BOLL, VWAP, AVL, TRIX, SAR
 *  - 서브(별도 패인): VOL, MACD, RSI, KDJ, OBV, CCI, StochRSI, WR, DMI, MTM, EMV
 *
 * ⚠️ 가드레일 2: 플랫폼은 지표를 **표시**만 한다. "이 지표가 이러니 사라"고 제안하지 않는다.
 *    설명문도 지표가 무엇을 계산하는지만 서술하고, 매매 판단을 말하지 않는다.
 *
 * ⚠️ 봇의 판단에 쓰이는 것은 이평선 교차뿐이다. 나머지는 눈으로 보는 참고 자료다.
 */

/** 가격 차트 위에 겹쳐 그리는 지표 */
export type MainIndicator = 'wma' | 'boll' | 'vwap' | 'avl' | 'sar';

/** 아래 별도 패인에 그리는 지표 */
export type SubIndicator =
  | 'volume'
  | 'macd'
  | 'rsi'
  | 'kdj'
  | 'obv'
  | 'cci'
  | 'stochrsi'
  | 'wr'
  | 'dmi'
  | 'mtm'
  | 'trix'
  | 'emv';

interface Meta {
  label: string;
  /** 이 지표가 무엇을 계산하는지. 매매 판단을 말하지 않는다. */
  desc: string;
}

export const MAIN_INDICATORS: { key: MainIndicator; meta: Meta }[] = [
  {
    key: 'wma',
    meta: { label: 'WMA', desc: '가중이동평균 — 최근 값에 더 큰 가중치를 주는 평균선입니다.' },
  },
  {
    key: 'boll',
    meta: {
      label: 'BOLL',
      desc: '볼린저 밴드 — 이동평균 위아래로 표준편차만큼 떨어진 밴드를 그립니다.',
    },
  },
  {
    key: 'vwap',
    meta: { label: 'VWAP', desc: '거래량 가중 평균가 — 거래량을 반영한 평균 가격입니다.' },
  },
  { key: 'avl', meta: { label: 'AVL', desc: '누적 평균가 — 거래량으로 가중한 누적 평균입니다.' } },
  {
    key: 'sar',
    meta: {
      label: 'SAR',
      desc: '파라볼릭 SAR — 가격 위아래에 점을 찍어 추세 방향을 표시합니다.',
    },
  },
];

export const SUB_INDICATORS: { key: SubIndicator; meta: Meta }[] = [
  { key: 'volume', meta: { label: '거래량', desc: '캔들별 거래량입니다.' } },
  {
    key: 'macd',
    meta: {
      label: 'MACD',
      desc: '두 지수이동평균의 차이와 그 신호선, 그리고 둘의 간격을 막대로 표시합니다.',
    },
  },
  {
    key: 'rsi',
    meta: { label: 'RSI', desc: '상대강도지수 — 최근 상승폭과 하락폭의 비율을 0~100으로 나타냅니다.' },
  },
  {
    key: 'stochrsi',
    meta: { label: 'StochRSI', desc: 'RSI 값에 스토캐스틱을 적용해 0~100으로 나타냅니다.' },
  },
  {
    key: 'kdj',
    meta: { label: 'KDJ', desc: '기간 내 고가·저가 대비 종가의 위치를 K·D·J 세 선으로 나타냅니다.' },
  },
  {
    key: 'cci',
    meta: { label: 'CCI', desc: '전형가가 평균에서 얼마나 떨어져 있는지를 나타냅니다.' },
  },
  {
    key: 'wr',
    meta: { label: 'W%R', desc: '윌리엄스 %R — 기간 최고가 대비 현재 종가의 위치입니다 (−100~0).' },
  },
  {
    key: 'dmi',
    meta: { label: 'DMI', desc: '상승·하락 방향성 지표(+DI, −DI)와 추세 강도(ADX)입니다.' },
  },
  { key: 'mtm', meta: { label: 'MTM', desc: '모멘텀 — 현재가와 일정 기간 전 가격의 차이입니다.' } },
  { key: 'trix', meta: { label: 'TRIX', desc: '삼중 지수이동평균의 변화율(%)입니다.' } },
  { key: 'obv', meta: { label: 'OBV', desc: '가격 방향에 따라 거래량을 누적한 값입니다.' } },
  {
    key: 'emv',
    meta: { label: 'EMV', desc: '가격이 얼마나 적은 거래량으로 움직였는지를 나타냅니다.' },
  },
];

export function subMeta(key: SubIndicator): Meta {
  return SUB_INDICATORS.find((x) => x.key === key)!.meta;
}

export function mainMeta(key: MainIndicator): Meta {
  return MAIN_INDICATORS.find((x) => x.key === key)!.meta;
}
