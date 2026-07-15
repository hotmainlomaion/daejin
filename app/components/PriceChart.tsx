'use client';

import { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts';
import {
  avlSeries,
  bollingerSeries,
  cciSeries,
  dmiSeries,
  emvSeries,
  kdjSeries,
  macdSeries,
  maSeries,
  mtmSeries,
  obvSeries,
  rsiSeries,
  sarSeries,
  stochRsiSeries,
  trixSeries,
  vwapSeries,
  williamsRSeries,
  wmaSeries,
  type Candle,
} from '@futureslab/shared';
import type { MainIndicator, SubIndicator } from '@/lib/indicators';

export interface TradeMarker {
  /** 체결 시각 (epoch ms) */
  time: number;
  side: 'BUY' | 'SELL';
  price: number;
}

interface Props {
  candles: Candle[];
  fastPeriod: number;
  slowPeriod: number;
  maType: 'SMA' | 'EMA';
  trades?: TradeMarker[];
  mainIndicator?: MainIndicator;
  subIndicator?: SubIndicator;
}

const COLOR = {
  up: '#26a69a',
  down: '#ef5350',
  fast: '#f0b90b',
  slow: '#7b61ff',
  grid: '#1c2027',
  border: '#2a2f3a',
  text: '#848e9c',
  a: '#2196f3',
  b: '#ff9800',
  c: '#e91e63',
} as const;

const SUB_PANE_HEIGHT = 110;

/**
 * 캔들 차트 + 전략 이평선 + 봇의 체결 마커 + 바이낸스 지표(메인 오버레이 / 서브 패인).
 *
 * 이 화면의 목적은 예쁜 차트가 아니라 **"봇이 왜 그때 들어갔는지"를 눈으로 확인**하는 것이다
 * (CLAUDE.md §디자인 톤). 그래서 전략 이평선은 봇이 판단에 쓰는 것과 같은 계산(maSeries)이고,
 * 마커는 실제 체결 기록이다.
 *
 * ⚠️ 지표는 **참고용 시각화**일 뿐 봇의 판단에 쓰이지 않는다. 현재 전략은 이평선 교차뿐이다.
 *    화면이 "RSI가 낮으니 사라"고 말하지 않는다 (가드레일 2).
 */
export function PriceChart({
  candles,
  fastPeriod,
  slowPeriod,
  maType,
  trades = [],
  mainIndicator = 'none',
  subIndicator = 'volume',
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || candles.length === 0) return;

    const chart = createChart(el, {
      layout: {
        background: { color: 'transparent' },
        textColor: COLOR.text,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        panes: { separatorColor: COLOR.border, separatorHoverColor: COLOR.grid, enableResize: true },
      },
      grid: { vertLines: { color: COLOR.grid }, horzLines: { color: COLOR.grid } },
      rightPriceScale: { borderColor: COLOR.border },
      timeScale: { borderColor: COLOR.border, timeVisible: true },
      crosshair: { mode: 0 },
      autoSize: true,
    });
    chartRef.current = chart;

    // lightweight-charts의 time은 초 단위
    const toTime = (ms: number) => Math.floor(ms / 1000) as Time;
    const at = (i: number) => toTime(candles[i]!.openTime);
    const closes = candles.map((c) => c.close);

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: COLOR.up,
      downColor: COLOR.down,
      borderUpColor: COLOR.up,
      borderDownColor: COLOR.down,
      wickUpColor: COLOR.up,
      wickDownColor: COLOR.down,
    });
    candleSeries.setData(
      candles.map((c) => ({
        time: toTime(c.openTime),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    /** null을 걸러 라인 시리즈에 넣는다. 데이터 부족 구간은 선이 시작되지 않는다. */
    const setLine = (series: ISeriesApi<'Line'>, values: (number | null)[]) => {
      series.setData(
        values
          .map((v, i) => ({ time: at(i), value: v }))
          .filter((p): p is { time: Time; value: number } => p.value !== null),
      );
    };

    const line = (opts: {
      color: string;
      title: string;
      pane?: number;
      width?: 1 | 2;
      range?: [number, number];
    }) =>
      chart.addSeries(
        LineSeries,
        {
          color: opts.color,
          lineWidth: opts.width ?? 1,
          priceLineVisible: false,
          lastValueVisible: false,
          title: opts.title,
          // 고정 범위 지표(RSI 등)는 자동 스케일을 끄지 않으면 축이 흔들린다
          ...(opts.range
            ? {
                autoscaleInfoProvider: () => ({
                  priceRange: { minValue: opts.range![0], maxValue: opts.range![1] },
                }),
              }
            : {}),
        },
        opts.pane ?? 0,
      );

    // ── 전략 이평선 (봇이 쓰는 것과 동일한 계산) ──────────
    setLine(line({ color: COLOR.fast, title: `${maType} ${fastPeriod}` }), maSeries(closes, fastPeriod, maType));
    setLine(line({ color: COLOR.slow, title: `${maType} ${slowPeriod}` }), maSeries(closes, slowPeriod, maType));

    // ── 메인 지표 (가격 위 오버레이) ──────────────────────
    switch (mainIndicator) {
      case 'wma':
        setLine(line({ color: COLOR.a, title: 'WMA 20' }), wmaSeries(closes, 20));
        break;
      case 'boll': {
        const bb = bollingerSeries(closes);
        setLine(line({ color: COLOR.a, title: 'BOLL 상단' }), bb.map((p) => p.upper));
        setLine(line({ color: COLOR.text, title: 'BOLL 중심' }), bb.map((p) => p.middle));
        setLine(line({ color: COLOR.a, title: 'BOLL 하단' }), bb.map((p) => p.lower));
        break;
      }
      case 'vwap':
        setLine(line({ color: COLOR.b, title: 'VWAP' }), vwapSeries(candles));
        break;
      case 'avl':
        setLine(line({ color: COLOR.b, title: 'AVL' }), avlSeries(candles));
        break;
      case 'sar': {
        // SAR은 선이 아니라 점 — 캔들 위아래를 오가므로 선으로 이으면 오해를 준다
        const sar = chart.addSeries(LineSeries, {
          color: COLOR.c,
          lineWidth: 1,
          lineVisible: false,
          pointMarkersVisible: true,
          priceLineVisible: false,
          lastValueVisible: false,
          title: 'SAR',
        });
        setLine(sar, sarSeries(candles));
        break;
      }
    }

    // ── 서브 지표 (별도 패인) ─────────────────────────────
    const P = 1; // 서브 패인 인덱스
    switch (subIndicator) {
      case 'volume': {
        const vol = chart.addSeries(
          HistogramSeries,
          { priceFormat: { type: 'volume' }, priceLineVisible: false },
          P,
        );
        vol.setData(
          candles.map((c) => ({
            time: toTime(c.openTime),
            value: c.volume,
            // 캔들 방향과 색을 맞춰야 "그때 거래가 몰렸다"가 읽힌다
            color: c.close >= c.open ? `${COLOR.up}80` : `${COLOR.down}80`,
          })),
        );
        break;
      }
      case 'rsi': {
        const s = line({ color: COLOR.a, title: 'RSI 14', pane: P, range: [0, 100] });
        setLine(s, rsiSeries(closes, 14));
        // 30/70은 관례적 참고선일 뿐 "여기서 사라/팔아라"가 아니다 (가드레일 2)
        for (const level of [30, 70]) {
          s.createPriceLine({ price: level, color: COLOR.border, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
        }
        break;
      }
      case 'stochrsi': {
        const sr = stochRsiSeries(closes);
        setLine(line({ color: COLOR.a, title: 'K', pane: P, range: [0, 100] }), sr.map((p) => p.k));
        setLine(line({ color: COLOR.b, title: 'D', pane: P, range: [0, 100] }), sr.map((p) => p.d));
        break;
      }
      case 'macd': {
        const m = macdSeries(closes);
        const hist = chart.addSeries(HistogramSeries, { priceLineVisible: false, title: 'HIST' }, P);
        hist.setData(
          m
            .map((p, i) => ({ time: at(i), value: p.histogram }))
            .filter((p): p is { time: Time; value: number } => p.value !== null)
            .map((p) => ({ ...p, color: p.value >= 0 ? `${COLOR.up}80` : `${COLOR.down}80` })),
        );
        setLine(line({ color: COLOR.a, title: 'MACD', pane: P }), m.map((p) => p.macd));
        setLine(line({ color: COLOR.b, title: 'SIGNAL', pane: P }), m.map((p) => p.signal));
        break;
      }
      case 'kdj': {
        const k = kdjSeries(candles);
        setLine(line({ color: COLOR.a, title: 'K', pane: P }), k.map((p) => p.k));
        setLine(line({ color: COLOR.b, title: 'D', pane: P }), k.map((p) => p.d));
        setLine(line({ color: COLOR.c, title: 'J', pane: P }), k.map((p) => p.j));
        break;
      }
      case 'dmi': {
        const d = dmiSeries(candles);
        setLine(line({ color: COLOR.up, title: '+DI', pane: P }), d.map((p) => p.plusDi));
        setLine(line({ color: COLOR.down, title: '−DI', pane: P }), d.map((p) => p.minusDi));
        setLine(line({ color: COLOR.b, title: 'ADX', pane: P }), d.map((p) => p.adx));
        break;
      }
      case 'cci':
        setLine(line({ color: COLOR.a, title: 'CCI 20', pane: P }), cciSeries(candles));
        break;
      case 'wr':
        setLine(line({ color: COLOR.a, title: 'W%R 14', pane: P, range: [-100, 0] }), williamsRSeries(candles));
        break;
      case 'mtm':
        setLine(line({ color: COLOR.a, title: 'MTM 12', pane: P }), mtmSeries(closes));
        break;
      case 'trix':
        setLine(line({ color: COLOR.a, title: 'TRIX 12', pane: P }), trixSeries(closes));
        break;
      case 'obv':
        setLine(line({ color: COLOR.a, title: 'OBV', pane: P }), obvSeries(candles));
        break;
      case 'emv':
        setLine(line({ color: COLOR.a, title: 'EMV 14', pane: P }), emvSeries(candles));
        break;
    }

    if (subIndicator !== 'none') chart.panes()[P]?.setHeight(SUB_PANE_HEIGHT);

    // ── 봇의 실제 체결 지점 ────────────────────────────────
    if (trades.length > 0) {
      createSeriesMarkers(
        candleSeries,
        trades
          .slice()
          .sort((a, b) => a.time - b.time)
          .map((t) => ({
            time: toTime(t.time),
            position: t.side === 'BUY' ? ('belowBar' as const) : ('aboveBar' as const),
            color: t.side === 'BUY' ? COLOR.up : COLOR.down,
            shape: t.side === 'BUY' ? ('arrowUp' as const) : ('arrowDown' as const),
            text: t.side === 'BUY' ? '매수' : '매도',
          })),
      );
    }

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, fastPeriod, slowPeriod, maType, trades, mainIndicator, subIndicator]);

  if (candles.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        시세를 불러오는 중…
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" />;
}
