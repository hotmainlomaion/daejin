import type { ActionResult } from '@/app/actions';

/** 서버 액션이 돌려준 오류를 폼 안에 표시한다. */
export function FormError({ state }: { state: ActionResult | null }) {
  if (!state || !('error' in state)) return null;
  return (
    <p className="rounded bg-short/10 px-3 py-2 text-sm text-short" role="alert">
      {state.error}
    </p>
  );
}
