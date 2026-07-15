'use client';

import { useActionState } from 'react';
import { MA_CROSSOVER_DEFAULTS } from '@futureslab/shared';
import { createBot, type ActionResult } from '@/app/actions';
import { FormError } from '@/components/FormError';
import { TestnetNotice } from '@/components/TestnetNotice';

const inputClass =
  'w-full rounded border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-brand';

/**
 * 봇 생성 폼 (PRD F5).
 *
 * 최초 1회 생성만 담당한다 — 레버리지·손절·전략 파라미터 조정은 터미널의 봇 패널에서 한다.
 * 여기서 다 받으면 온보딩이 길어지고, 터미널과 설정 UI가 두 벌이 된다.
 *
 * MVP는 이평선 교차 1종만 (week1.md Day 2). 나머지 2종은 Day 6.
 */
export function BotForm({ keys }: { keys: { id: string; label: string }[] }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(createBot, null);

  return (
    <form action={formAction} className="space-y-5">
      {/* 기본값은 strategy-templates.md의 예시일 뿐 플랫폼의 권장값이 아니다 (가드레일 2). */}
      <input type="hidden" name="fastPeriod" value={MA_CROSSOVER_DEFAULTS.fastPeriod} />
      <input type="hidden" name="slowPeriod" value={MA_CROSSOVER_DEFAULTS.slowPeriod} />
      <input type="hidden" name="maType" value={MA_CROSSOVER_DEFAULTS.maType} />
      <input type="hidden" name="onDeadCross" value="CLOSE_ONLY" />
      <input type="hidden" name="positionSizePct" value={MA_CROSSOVER_DEFAULTS.positionSizePct} />
      <input type="hidden" name="stopLossPct" value={MA_CROSSOVER_DEFAULTS.stopLossPct} />
      <input type="hidden" name="takeProfitPct" value={MA_CROSSOVER_DEFAULTS.takeProfitPct} />
      <input type="hidden" name="leverage" value={MA_CROSSOVER_DEFAULTS.leverage} />

      <Field label="봇 이름" htmlFor="name">
        <input id="name" name="name" defaultValue="이평선 교차 전략" className={inputClass} />
      </Field>

      <Field label="테스트넷 키" htmlFor="exchangeKeyId">
        <select id="exchangeKeyId" name="exchangeKeyId" className={inputClass}>
          {keys.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="심볼" htmlFor="symbol">
          <select id="symbol" name="symbol" defaultValue={MA_CROSSOVER_DEFAULTS.symbol} className={inputClass}>
            <option value="BTCUSDT">BTCUSDT</option>
            <option value="ETHUSDT">ETHUSDT</option>
          </select>
        </Field>

        <Field label="캔들 주기" htmlFor="timeframe">
          <select id="timeframe" name="timeframe" defaultValue={MA_CROSSOVER_DEFAULTS.timeframe} className={inputClass}>
            <option value="1m">1분</option>
            <option value="5m">5분</option>
            <option value="15m">15분</option>
            <option value="1h">1시간</option>
          </select>
        </Field>
      </div>

      <p className="text-xs leading-relaxed text-faint">
        레버리지·손절·전략 파라미터는 만든 뒤 터미널 화면에서 조정합니다.
      </p>

      <FormError state={state} />
      <TestnetNotice variant="inline" />

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-brand px-5 py-3 text-sm font-semibold text-canvas transition hover:brightness-110 disabled:opacity-40"
      >
        {pending ? '생성 중…' : '봇 만들기'}
      </button>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}
