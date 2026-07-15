'use client';

import { useMemo } from 'react';
import { maSeries, type Candle } from '@futureslab/shared';
import { PriceLadder } from '@/components/PriceLadder';
import type { PositionView } from '@/components/BottomTabs';

/**
 * "봇의 눈" — 봇이 지금 무엇을 보고 무엇을 기다리는지 쉬운 말로 보여준다.
 *
 * 로그의 "교차 없음"은 선물을 아는 사람에게도 지루하고, 모르는 사람에겐 아무 의미가 없다.
 * 여기서는 두 이평선의 **현재 간격**과 **어느 쪽이 위인지**를 보여주고,
 * "무슨 일이 일어나면 봇이 무엇을 할지"를 문장으로 설명한다.
 *
 * ⚠️ 가드레일 2·3: 예측하지 않고 추천하지 않는다. "곧 오를 것", "지금 사야" 류 금지.
 *    봇의 **규칙**만 서술한다 — "위로 뚫으면 매수합니다"는 사실이지 예측이 아니다.
 */
export function BotWatch({
  candles,
  fastPeriod,
  slowPeriod,
  maType,
  onDeadCross,
  position,
  currentPrice,
  stopLossPct,
  takeProfitPct,
  status,
}: {
  candles: Candle[];
  fastPeriod: number;
  slowPeriod: number;
  maType: 'SMA' | 'EMA';
  onDeadCross: 'SHORT' | 'CLOSE_ONLY';
  position: PositionView | null;
  currentPrice: number | null;
  stopLossPct: number;
  takeProfitPct: number;
  status: 'stopped' | 'running' | 'error';
}) {
  // 차트·봇과 같은 계산을 쓴다 (maSeries → 전략의 movingAverage). 화면과 판단이 어긋나면 안 된다.
  const { fast, slow } = useMemo(() => {
    const closes = candles.map((c) => c.close);
    const f = maSeries(closes, fastPeriod, maType);
    const s = maSeries(closes, slowPeriod, maType);
    return { fast: f[f.length - 1] ?? null, slow: s[s.length - 1] ?? null };
  }, [candles, fastPeriod, slowPeriod, maType]);

  if (fast === null || slow === null) {
    return (
      <Shell>
        <p className="text-[11px] leading-relaxed text-faint">
          이평선을 계산할 캔들이 아직 부족합니다. 장기 {maType} {slowPeriod} 기준으로{' '}
          {slowPeriod + 1}개가 필요합니다.
        </p>
      </Shell>
    );
  }

  const fastAbove = fast > slow;
  const gap = fast - slow;
  const gapPct = (Math.abs(gap) / slow) * 100;

  // 간격이 좁을수록 교차가 가깝다. 0.5%를 "먼" 기준으로 잡아 시각화한다
  // (예측이 아니라 현재 간격의 표현일 뿐이다).
  const FAR_PCT = 0.5;
  const closeness = Math.max(0, Math.min(1, 1 - gapPct / FAR_PCT));

  return (
    <Shell>
      {/* 두 선의 관계 */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] text-muted">봇이 보는 두 선</span>
          <span className="font-mono text-[11px] text-faint">
            간격 {gapPct.toFixed(3)}%
          </span>
        </div>

        <div className="space-y-1.5">
          <MaRow
            color="#f0b90b"
            label={`단기 ${maType} ${fastPeriod}`}
            value={fast}
            hint="최근 가격에 빠르게 반응"
          />
          <MaRow
            color="#7b61ff"
            label={`장기 ${maType} ${slowPeriod}`}
            value={slow}
            hint="큰 흐름을 천천히 반영"
          />
        </div>

        {/* 교차 근접도 — 좁을수록 채워진다 */}
        <div className="space-y-1">
          <div className="h-1 overflow-hidden rounded bg-panel">
            <div
              className={`h-full rounded transition-all ${fastAbove ? 'bg-long' : 'bg-short'}`}
              style={{ width: `${closeness * 100}%` }}
            />
          </div>
          <p className="text-[10px] text-faint">
            막대가 길수록 두 선이 가까운 상태입니다 (교차가 임박했다는 뜻은 아닙니다).
          </p>
        </div>
      </div>

      {/* 쉬운 말 상태 설명 */}
      <div className="rounded bg-canvas p-2.5">
        <p className="text-[11px] leading-relaxed text-ink">
          지금 <strong className="text-[#f0b90b]">단기선</strong>이{' '}
          <strong className="text-[#7b61ff]">장기선</strong>보다{' '}
          <strong className={fastAbove ? 'text-long' : 'text-short'}>
            {fastAbove ? '위에' : '아래에'}
          </strong>{' '}
          있습니다.
        </p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
          {status !== 'running' ? (
            <>봇이 정지 상태라 아무 것도 하지 않습니다. 시작하면 아래 규칙대로 움직입니다.</>
          ) : position ? (
            <>
              포지션을 들고 있습니다. 손절·익절이 먼저 걸리는지 매 캔들 확인하고, 그 다음
              {fastAbove ? ' 단기선이 아래로 내려가면' : ' 단기선이 위로 올라가면'} 정리합니다.
            </>
          ) : fastAbove ? (
            <>
              이미 위에 있어 지금은 진입하지 않습니다. 아래로 내려갔다가 다시{' '}
              <strong className="text-ink">위로 뚫는 순간</strong> 매수합니다.
            </>
          ) : (
            <>
              단기선이 <strong className="text-ink">위로 뚫으면 매수</strong>합니다
              {onDeadCross === 'SHORT'
                ? ', 반대로 더 내려가며 교차하면 매도(숏)합니다'
                : ' (하락 교차 시에는 진입하지 않는 설정입니다)'}
              .
            </>
          )}
        </p>
        <p className="mt-1.5 text-[10px] leading-relaxed text-faint">
          판단은 캔들이 마감될 때만 합니다. 캔들 중간의 가격 움직임으로는 진입하지 않습니다.
        </p>
      </div>

      {/* 포지션이 있으면 가격 사다리 — 선물 초보에게 가장 중요 */}
      {position && currentPrice !== null && (
        <PriceLadder
          position={position}
          currentPrice={currentPrice}
          stopLossPct={stopLossPct}
          takeProfitPct={takeProfitPct}
        />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3 p-4">{children}</div>;
}

function MaRow({
  color,
  label,
  value,
  hint,
}: {
  color: string;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="h-0.5 w-3 shrink-0 rounded" style={{ backgroundColor: color }} />
      <span className="shrink-0 text-[11px] text-muted">{label}</span>
      <span className="font-mono text-[11px] text-ink">
        {value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
      </span>
      <span className="ml-auto text-[10px] text-faint">{hint}</span>
    </div>
  );
}
