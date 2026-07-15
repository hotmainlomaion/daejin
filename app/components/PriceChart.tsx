'use client';

import { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type Time,
} from 'lightweight-charts';
import { maSeries, type Candle } from '@futureslab/shared';

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
}

/**
 * 캔들 차트 + 전략 이평선 + 봇의 진입/청산 마커.
 *
 * 이 화면의 목적은 예쁜 차트가 아니라 **"봇이 왜 그때 들어갔는지"를 눈으로 확인**하는 것이다
 * (CLAUDE.md §디자인 톤). 그래서 그리는 이평선은 봇이 판단에 쓰는 것과 같은 계산(maSeries)이고,
 * 마커는 실제 체결 기록이다.
 */
export function PriceChart({ candles, fastPeriod, slowPeriod, maType, trades = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || candles.length === 0) return;

    const chart = createChart(el, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#848e9c',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      },
      grid: {
        vertLines: { color: '#1c2027' },
        horzLines: { color: '#1c2027' },
      },
      rightPriceScale: { borderColor: '#2a2f3a' },
      timeScale: { borderColor: '#2a2f3a', timeVisible: true },
      crosshair: { mode: 0 },
      autoSize: true,
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    // lightweight-charts의 time은 초 단위
    const toTime = (ms: number) => Math.floor(ms / 1000) as Time;

    candleSeries.setData(
      candles.map((c) => ({
        time: toTime(c.openTime),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    // 전략 이평선 — 봇이 쓰는 것과 동일한 계산
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
          // 데이터 부족 구간은 그리지 않는다
          .filter((p): p is { time: Time; value: number } => p.value !== null),
      );
    };

    drawMa(fastPeriod, '#f0b90b', `${maType} ${fastPeriod}`);
    drawMa(slowPeriod, '#7b61ff', `${maType} ${slowPeriod}`);

    // 봇의 실제 체결 지점
    if (trades.length > 0) {
      createSeriesMarkers(
        candleSeries,
        trades
          .slice()
          .sort((a, b) => a.time - b.time)
          .map((t) => ({
            time: toTime(t.time),
            position: t.side === 'BUY' ? ('belowBar' as const) : ('aboveBar' as const),
            color: t.side === 'BUY' ? '#26a69a' : '#ef5350',
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
  }, [candles, fastPeriod, slowPeriod, maType, trades]);

  if (candles.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        시세를 불러오는 중…
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" />;
}
