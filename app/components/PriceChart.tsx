'use client';

import { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type Time,
} from 'lightweight-charts';
import { maSeries, rsiSeries, type Candle } from '@futureslab/shared';

export interface TradeMarker {
  /** 체결 시각 (epoch ms) */
  time: number;
  side: 'BUY' | 'SELL';
  price: number;
}

/** 보조지표 패인 선택. 'none'이면 가격 차트만 전체 높이를 쓴다. */
export type SubIndicator = 'none' | 'volume' | 'rsi';

interface Props {
  candles: Candle[];
  fastPeriod: number;
  slowPeriod: number;
  maType: 'SMA' | 'EMA';
  trades?: TradeMarker[];
  subIndicator?: SubIndicator;
  rsiPeriod?: number;
}

const COLOR = {
  up: '#26a69a',
  down: '#ef5350',
  fast: '#f0b90b',
  slow: '#7b61ff',
  grid: '#1c2027',
  border: '#2a2f3a',
  text: '#848e9c',
  rsi: '#2196f3',
} as const;

/**
 * 캔들 차트 + 전략 이평선 + 봇의 진입/청산 마커 + 보조지표 패인.
 *
 * 이 화면의 목적은 예쁜 차트가 아니라 **"봇이 왜 그때 들어갔는지"를 눈으로 확인**하는 것이다
 * (CLAUDE.md §디자인 톤). 그래서 그리는 이평선은 봇이 판단에 쓰는 것과 같은 계산(maSeries)이고,
 * 마커는 실제 체결 기록이다.
 *
 * ⚠️ 보조지표는 참고용 시각화일 뿐, 봇의 판단에는 쓰이지 않는다 (현재 전략은 이평선 교차).
 *    화면이 "RSI가 낮으니 사라"고 말하지 않는다 — 가드레일 2(전략 추천 금지).
 */
export function PriceChart({
  candles,
  fastPeriod,
  slowPeriod,
  maType,
  trades = [],
  subIndicator = 'volume',
  rsiPeriod = 14,
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
        // 보조지표를 별도 패인으로 띄운다 (v5의 panes 기능)
        panes: { separatorColor: COLOR.border, separatorHoverColor: COLOR.grid, enableResize: true },
      },
      grid: {
        vertLines: { color: COLOR.grid },
        horzLines: { color: COLOR.grid },
      },
      rightPriceScale: { borderColor: COLOR.border },
      timeScale: { borderColor: COLOR.border, timeVisible: true },
      crosshair: { mode: 0 },
      autoSize: true,
    });
    chartRef.current = chart;

    // lightweight-charts의 time은 초 단위
    const toTime = (ms: number) => Math.floor(ms / 1000) as Time;

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

    // ── 전략 이평선 (봇이 쓰는 것과 동일한 계산) ──────────
    const closes = candles.map((c) => c.close);
    const drawMa = (period: number, color: string, title: string) => {
      const series = chart.addSeries(LineSeries, {
        color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        title,
      });
      series.setData(
        maSeries(closes, period, maType)
          .map((v, i) => ({ time: toTime(candles[i]!.openTime), value: v }))
          .filter((p): p is { time: Time; value: number } => p.value !== null),
      );
    };

    drawMa(fastPeriod, COLOR.fast, `${maType} ${fastPeriod}`);
    drawMa(slowPeriod, COLOR.slow, `${maType} ${slowPeriod}`);

    // ── 보조지표 패인 ──────────────────────────────────────
    if (subIndicator === 'volume') {
      const vol = chart.addSeries(
        HistogramSeries,
        { priceFormat: { type: 'volume' }, priceLineVisible: false },
        1, // paneIndex — 아래에 별도 패인으로
      );
      vol.setData(
        candles.map((c) => ({
          time: toTime(c.openTime),
          value: c.volume,
          // 캔들 방향과 색을 맞춰야 "그때 거래가 몰렸다"가 읽힌다
          color: c.close >= c.open ? `${COLOR.up}80` : `${COLOR.down}80`,
        })),
      );
      chart.panes()[1]?.setHeight(90);
    } else if (subIndicator === 'rsi') {
      const rsiLine = chart.addSeries(
        LineSeries,
        {
          color: COLOR.rsi,
          lineWidth: 1,
          priceLineVisible: false,
          title: `RSI ${rsiPeriod}`,
          // RSI는 0~100 고정 스케일이라 자동 스케일을 끄지 않으면 축이 흔들린다
          autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
        },
        1,
      );
      rsiLine.setData(
        rsiSeries(closes, rsiPeriod)
          .map((v, i) => ({ time: toTime(candles[i]!.openTime), value: v }))
          .filter((p): p is { time: Time; value: number } => p.value !== null),
      );
      // 30/70 기준선. strategy-templates.md의 기본값이며 관례적 참고선일 뿐
      // "여기서 사라/팔아라"는 뜻이 아니다 (가드레일 2).
      for (const level of [30, 70]) {
        rsiLine.createPriceLine({
          price: level,
          color: COLOR.border,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: '',
        });
      }
      chart.panes()[1]?.setHeight(90);
    }

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
  }, [candles, fastPeriod, slowPeriod, maType, trades, subIndicator, rsiPeriod]);

  if (candles.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        시세를 불러오는 중…
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" />;
}
