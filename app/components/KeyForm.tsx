'use client';

import { useActionState } from 'react';
import { registerExchangeKey, type ActionResult } from '@/app/actions';
import { FormError } from '@/components/FormError';

const inputClass =
  'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900';

/**
 * 테스트넷 키 입력 폼.
 * 입력값은 서버 액션으로만 전송되고, 이 컴포넌트는 키를 상태로 보관하지 않는다
 * (비제어 입력 — 브라우저 메모리에 남는 시간을 줄인다).
 */
export function KeyForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    registerExchangeKey,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="label" className="block text-sm font-medium text-neutral-700">
          라벨
        </label>
        <input id="label" name="label" defaultValue="테스트넷 키" className={inputClass} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="apiKey" className="block text-sm font-medium text-neutral-700">
          API Key
        </label>
        <input
          id="apiKey"
          name="apiKey"
          required
          autoComplete="off"
          spellCheck={false}
          className={`${inputClass} font-mono`}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="secret" className="block text-sm font-medium text-neutral-700">
          Secret Key
        </label>
        {/* type=password로 어깨너머 노출을 막는다. 저장 후에는 다시 표시하지 않는다. */}
        <input
          id="secret"
          name="secret"
          type="password"
          required
          autoComplete="off"
          spellCheck={false}
          className={`${inputClass} font-mono`}
        />
      </div>

      <FormError state={state} />

      <p className="text-xs leading-relaxed text-neutral-500">
        입력한 키는 서버에서 암호화되어 저장되며, 복호화는 주문을 실행하는 워커에서만 이루어집니다.
        등록 후에는 화면에 다시 표시되지 않습니다.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50"
      >
        {pending ? '등록 중…' : '키 등록'}
      </button>
    </form>
  );
}
