'use client';

import { useState } from 'react';

/**
 * 봇 설정 패널 — 거래소의 "주문 패널" 자리를 번역한 것 (CLAUDE.md §디자인 톤).
 *
 * KuCoin Lite의 주문 패널과 형태는 같지만 의미가 다르다:
 * 이 제품은 유저가 직접 주문하지 않고 **봇이 조건 충족 시 대신 주문**한다.
 * 그래서 버튼은 "매수/매도"가 아니라 "봇 시작"이다.
 */
export interface BotConfig {
  positionSizePct: number;
  leverage: number;
  stopLossPct: number;
  takeProfitPct: number;
  fastPeriod: number;
  slowPeriod: number;
  maType: 'SMA' | 'EMA';
  onDeadCross: 'SHORT' | 'CLOSE_ONLY';
}

interface Props {
  config: BotConfig;
  onChange: (config: BotConfig) => void;
  onSubmit: () => void;
  status: 'stopped' | 'running' | 'error';
  pending?: boolean;
  disabled?: boolean;
  error?: string | null;
  /** 저장되지 않은 변경이 있는지 — 실행 중 수정은 재시작해야 반영된다는 걸 알린다 */
  dirty?: boolean;
  account?: { walletBalance: number; availableBalance: number; unrealizedPnl: number } | null;
}

const LEVERAGE_MARKS = [1, 25, 50, 75, 100];
const SIZE_PRESETS = [10, 25, 50, 100];

export function BotPanel({
  config,
  onChange,
  onSubmit,
  status,
  pending,
  disabled,
  error,
  dirty,
  account,
}: Props) {
  const [tab, setTab] = useState<'basic' | 'strategy'>('basic');
  const set = <K extends keyof BotConfig>(k: K, v: BotConfig[K]) => onChange({ ...config, [k]: v });
  const running = status === 'running';

  // 진입 시 실제로 얼마가 들어가는지 미리 보여준다 — %만 보면 감이 안 온다.
  const estimatedMargin = account ? (account.availableBalance * config.positionSizePct) / 100 : null;

  return (
    <aside className="flex w-full flex-col gap-4 overflow-y-auto border-l border-line bg-panel p-4 lg:w-[320px] lg:shrink-0">
      {/* 테스트넷 자산 — KuCoin Lite의 "USDT자산" 섹션 */}
      {account && (
        <div className="space-y-1.5 rounded bg-canvas p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-muted">테스트넷 자산</span>
            <span className="font-mono text-sm font-semibold text-ink">
              {account.walletBalance.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} USDT
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-faint">사용 가능</span>
            <span className="font-mono text-[11px] text-muted">
              {account.availableBalance.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-faint">미실현 손익</span>
            <span
              className={`font-mono text-[11px] ${account.unrealizedPnl >= 0 ? 'text-long' : 'text-short'}`}
            >
              {account.unrealizedPnl >= 0 ? '+' : '−'}
              {Math.abs(account.unrealizedPnl).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}

      {/* 탭 — 기본 / 전략 */}
      <div className="flex gap-1 rounded bg-canvas p-1">
        {(
          [
            ['basic', '기본'],
            ['strategy', '전략'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition ${
              tab === key ? 'bg-elevated text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'basic' ? (
        <>
          {/* 진입 규모 */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted">진입 규모</span>
              {/* %만 보면 실제 금액 감이 안 오므로 환산해서 같이 보여준다 */}
              <span className="font-mono text-xs text-muted">
                {estimatedMargin !== null
                  ? `약 ${estimatedMargin.toLocaleString('ko-KR', { maximumFractionDigits: 0 })} USDT`
                  : `잔고의 ${config.positionSizePct}%`}
              </span>
            </div>
            <input
              type="number"
              min={1}
              max={100}
              step={0.1}
              value={config.positionSizePct}
              onChange={(e) => set('positionSizePct', Number(e.target.value))}
              className="w-full rounded border border-line bg-canvas px-3 py-2 font-mono text-sm outline-none focus:border-brand"
            />
            <div className="grid grid-cols-4 gap-1">
              {SIZE_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => set('positionSizePct', p)}
                  className={`rounded py-1.5 text-xs transition ${
                    config.positionSizePct === p
                      ? 'bg-brand/20 text-brand'
                      : 'bg-elevated text-muted hover:text-ink'
                  }`}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>

          {/* 레버리지 */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted">레버리지</span>
              <span className="font-mono text-sm font-semibold text-ink">{config.leverage}x</span>
            </div>
            <input
              type="range"
              min={1}
              max={100}
              value={config.leverage}
              onChange={(e) => set('leverage', Number(e.target.value))}
              className="w-full accent-brand"
            />
            <div className="flex justify-between font-mono text-[10px] text-faint">
              {LEVERAGE_MARKS.map((m) => (
                <button key={m} type="button" onClick={() => set('leverage', m)} className="hover:text-ink">
                  {m}x
                </button>
              ))}
            </div>
            {config.leverage >= 20 && (
              <p className="text-[11px] leading-relaxed text-short">
                레버리지가 높을수록 청산 가격이 진입가에 가까워집니다.
              </p>
            )}
          </div>

          {/* 손절 / 익절 */}
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="손절 %">
              <input
                type="number"
                min={0}
                step={0.1}
                value={config.stopLossPct}
                onChange={(e) => set('stopLossPct', Number(e.target.value))}
                className="w-full rounded border border-line bg-canvas px-3 py-2 font-mono text-sm outline-none focus:border-short"
              />
            </Labeled>
            <Labeled label="익절 %">
              <input
                type="number"
                min={0}
                step={0.1}
                value={config.takeProfitPct}
                onChange={(e) => set('takeProfitPct', Number(e.target.value))}
                className="w-full rounded border border-line bg-canvas px-3 py-2 font-mono text-sm outline-none focus:border-long"
              />
            </Labeled>
          </div>
          <p className="text-[11px] leading-relaxed text-faint">
            진입가 대비 가격 변동률 기준 (레버리지 미반영). 0이면 해당 기능이 꺼집니다.
          </p>
        </>
      ) : (
        <>
          {/* 전략 파라미터 */}
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="단기 MA">
              <input
                type="number"
                min={1}
                value={config.fastPeriod}
                onChange={(e) => set('fastPeriod', Number(e.target.value))}
                className="w-full rounded border border-line bg-canvas px-3 py-2 font-mono text-sm outline-none focus:border-brand"
              />
            </Labeled>
            <Labeled label="장기 MA">
              <input
                type="number"
                min={2}
                value={config.slowPeriod}
                onChange={(e) => set('slowPeriod', Number(e.target.value))}
                className="w-full rounded border border-line bg-canvas px-3 py-2 font-mono text-sm outline-none focus:border-brand"
              />
            </Labeled>
          </div>
          {config.fastPeriod >= config.slowPeriod && (
            <p className="text-[11px] text-short">단기 기간은 장기 기간보다 작아야 합니다.</p>
          )}

          <Labeled label="MA 종류">
            <div className="flex gap-1 rounded bg-canvas p-1">
              {(['EMA', 'SMA'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set('maType', t)}
                  className={`flex-1 rounded py-1.5 text-xs transition ${
                    config.maType === t ? 'bg-elevated text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Labeled>

          <Labeled label="데드크로스 시">
            <div className="flex gap-1 rounded bg-canvas p-1">
              {(
                [
                  ['CLOSE_ONLY', '롱 청산만'],
                  ['SHORT', '숏 진입'],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => set('onDeadCross', v)}
                  className={`flex-1 rounded py-1.5 text-xs transition ${
                    config.onDeadCross === v ? 'bg-elevated text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Labeled>

          <p className="text-[11px] leading-relaxed text-faint">
            차트의 노란 선이 단기, 보라 선이 장기 이평선입니다. 봇은 두 선이 교차할 때 판단합니다.
          </p>
        </>
      )}

      <div className="mt-auto space-y-2 pt-2">
        {error && <p className="rounded bg-short/10 px-3 py-2 text-[11px] text-short">{error}</p>}

        {/* 실행 중 수정은 다음 기동에 반영된다 — 조용히 무시되는 것처럼 보이지 않게 알린다 */}
        {dirty && running && (
          <p className="rounded bg-[#f0b90b]/10 px-3 py-2 text-[11px] text-[#f0b90b]">
            변경한 설정은 봇을 정지 후 다시 시작해야 적용됩니다.
          </p>
        )}

        <button
          type="button"
          onClick={onSubmit}
          disabled={pending || disabled}
          className={`w-full rounded py-3 text-sm font-semibold transition disabled:opacity-40 ${
            running
              ? 'border border-line bg-elevated text-ink hover:bg-line'
              : 'bg-brand text-canvas hover:brightness-110'
          }`}
        >
          {pending ? '처리 중…' : running ? '봇 정지' : dirty ? '설정 저장 후 시작' : '봇 시작'}
        </button>
        {/* 가드레일 3·4: 수익 표현 없이 성격만 서술 */}
        <p className="text-center text-[11px] text-faint">테스트넷 · 실제 자금 미사용</p>
      </div>
    </aside>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs text-muted">{label}</span>
      {children}
    </div>
  );
}
