/**
 * 기술적 지표 모음 — 바이낸스 차트가 자체 메뉴에서 제공하는 지표 세트.
 *
 * 기준: 바이낸스의 **자체 지표 메뉴** (TradingView의 100+ 지표가 아니다)
 *  - 메인(가격 위 오버레이): MA, EMA, WMA, BOLL, VWAP, AVL, TRIX, SAR
 *  - 서브(별도 패인): VOL, MACD, RSI, KDJ, OBV, CCI, StochRSI, WR, DMI, MTM, EMV
 *
 * ⚠️ 이 지표들은 **차트 표시용 참고 자료**다. 봇의 판단에 쓰이는 것은 이평선 교차뿐이며,
 *    플랫폼이 "이 지표가 이러니 사라"고 제안하지 않는다 (CLAUDE.md 가드레일 2).
 *
 * 전부 순수 함수 + 단위 테스트. 돈 로직이라 버그 = 신뢰 붕괴 (CLAUDE.md 코딩 컨벤션).
 *
 * ⚠️ 미확정 사항이 몇 군데 있다. 각 파일의 `TODO(confirm)` 참조:
 *    VWAP 세션 리셋 · AVL 정의 · SAR 초기 추세/시드 · KDJ 시드 · EMV scale · W%R 평평 구간.
 *    실제 바이낸스 화면과 대조해 확정해야 한다.
 */

// ── 이동평균 계열 ────────────────────────────────────────
export { ema, maSeries, movingAverage, sma } from './moving-averages.ts';
export { wma, wmaSeries } from './wma.ts';

// ── 오버레이 ─────────────────────────────────────────────
export {
  BOLLINGER_DEFAULT_PERIOD,
  BOLLINGER_DEFAULT_STDDEV_MULT,
  bollingerBands,
  bollingerSeries,
  type BollingerBandsPoint,
  type BollingerBandsValue,
} from './bollinger.ts';
export { avlSeries, vwapSeries } from './vwap.ts';
export { SAR_DEFAULT_MAX_STEP, SAR_DEFAULT_STEP, sarSeries } from './sar.ts';

// ── 모멘텀·오실레이터 ────────────────────────────────────
export { rsi, rsiSeries } from './rsi.ts';
export {
  MACD_FAST_PERIOD,
  MACD_SIGNAL_PERIOD,
  MACD_SLOW_PERIOD,
  macdSeries,
  type MacdPoint,
} from './macd.ts';
export { TRIX_PERIOD, trixSeries } from './trix.ts';
export { MTM_PERIOD, WILLIAMS_R_PERIOD, mtmSeries, williamsRSeries } from './momentum.ts';
export { CCI_CONSTANT, CCI_PERIOD, cciSeries } from './cci.ts';
export {
  KDJ_DEFAULT_D_SMOOTH,
  KDJ_DEFAULT_K_SMOOTH,
  KDJ_DEFAULT_PERIOD,
  STOCH_RSI_DEFAULT_D_SMOOTH,
  STOCH_RSI_DEFAULT_K_SMOOTH,
  STOCH_RSI_DEFAULT_RSI_PERIOD,
  STOCH_RSI_DEFAULT_STOCH_PERIOD,
  kdjSeries,
  stochRsiSeries,
  type KdjValue,
  type StochRsiValue,
} from './stochastic.ts';

// ── 거래량·추세강도 ──────────────────────────────────────
export { EMV_DEFAULT_PERIOD, EMV_VOLUME_SCALE, emvSeries, obvSeries } from './volume.ts';
export { DMI_DEFAULT_PERIOD, dmiSeries, type DmiValue } from './dmi.ts';
