'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { MA_CROSSOVER_DEFAULTS } from '@futureslab/shared';
import { createBot, type ActionResult } from '@/app/actions';
import { FormError } from '@/components/FormError';
import { TestnetNotice } from '@/components/TestnetNotice';

const inputClass =
  'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900';

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
      <label htmlFor={htmlFor} className="block text-sm font-medium text-neutral-700">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * 봇 생성 폼 (PRD F4·F5).
 *
 * MVP는 이평선 교차 1종만 (week1.md Day 2 — "3종 다 만들지 말 것. 관통이 먼저다").
 * ⚠️ 기본값은 strategy-templates.md의 예시일 뿐 플랫폼의 권장값이 아니다 (가드레일 2).
 */
export function BotForm({ keys }: { keys: { id: string; label: string }[] }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    createBot,
    null,
  );

  return (
    <form action={formAction} className="space-y-8">
      <section className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold">기본 설정</h2>

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
      </section>

      <section className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold">전략 파라미터 — 이평선 교차</h2>

        <div className="grid grid-cols-2 gap-4">
          <Field label="단기 MA 기간" htmlFor="fastPeriod">
            <input id="fastPeriod" name="fastPeriod" type="number" min={1} defaultValue={MA_CROSSOVER_DEFAULTS.fastPeriod} className={inputClass} />
          </Field>

          <Field label="장기 MA 기간" htmlFor="slowPeriod">
            <input id="slowPeriod" name="slowPeriod" type="number" min={2} defaultValue={MA_CROSSOVER_DEFAULTS.slowPeriod} className={inputClass} />
          </Field>
        </div>
        {/* strategy-templates.md §2 엣지케이스: fast >= slow는 UI에서 막는다.
            서버 액션과 워커에서도 다시 검증한다. */}
        <p className="text-xs text-neutral-500">단기 기간은 장기 기간보다 작아야 합니다.</p>

        <div className="grid grid-cols-2 gap-4">
          <Field label="MA 종류" htmlFor="maType">
            <select id="maType" name="maType" defaultValue={MA_CROSSOVER_DEFAULTS.maType} className={inputClass}>
              <option value="EMA">EMA</option>
              <option value="SMA">SMA</option>
            </select>
          </Field>

          <Field label="데드크로스 시" htmlFor="onDeadCross">
            <select id="onDeadCross" name="onDeadCross" defaultValue="CLOSE_ONLY" className={inputClass}>
              <option value="CLOSE_ONLY">롱 청산만</option>
              <option value="SHORT">숏 진입</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold">리스크 설정</h2>

        <div className="grid grid-cols-3 gap-4">
          <Field label="레버리지 (배)" htmlFor="leverage">
            <input id="leverage" name="leverage" type="number" min={1} max={125} defaultValue={MA_CROSSOVER_DEFAULTS.leverage} className={inputClass} />
          </Field>

          <Field label="진입 규모 (잔고 %)" htmlFor="positionSizePct">
            <input id="positionSizePct" name="positionSizePct" type="number" min={1} max={100} step="0.1" defaultValue={MA_CROSSOVER_DEFAULTS.positionSizePct} className={inputClass} />
          </Field>

          <Field label="손절 (%)" htmlFor="stopLossPct">
            <input id="stopLossPct" name="stopLossPct" type="number" min={0} step="0.1" defaultValue={MA_CROSSOVER_DEFAULTS.stopLossPct} className={inputClass} />
          </Field>
        </div>

        <Field label="익절 (%)" htmlFor="takeProfitPct">
          <input id="takeProfitPct" name="takeProfitPct" type="number" min={0} step="0.1" defaultValue={MA_CROSSOVER_DEFAULTS.takeProfitPct} className={inputClass} />
        </Field>

        <p className="text-xs leading-relaxed text-neutral-500">
          손절·익절은 진입가 대비 <strong>가격 변동률</strong> 기준입니다 (레버리지 미반영).
          0으로 두면 해당 기능이 꺼집니다. 레버리지가 높을수록 청산 가격이 진입가에 가까워집니다.
        </p>
      </section>

      <FormError state={state} />
      <TestnetNotice variant="inline" />

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50"
        >
          {pending ? '생성 중…' : '봇 만들기'}
        </button>
        <Link href="/dashboard" className="text-sm text-neutral-500 hover:text-neutral-900">
          취소
        </Link>
      </div>
    </form>
  );
}
