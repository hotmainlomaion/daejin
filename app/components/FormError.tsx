import type { ActionResult } from '@/app/actions';

/** 서버 액션이 돌려준 오류를 폼 안에 표시한다. */
export function FormError({ state }: { state: ActionResult | null }) {
  if (!state || !('error' in state)) return null;
  return (
    <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-loss" role="alert">
      {state.error}
    </p>
  );
}
