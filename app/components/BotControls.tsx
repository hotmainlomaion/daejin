'use client';

import { useState, useTransition } from 'react';
import { setBotStatus } from '@/app/actions';

/**
 * 봇 시작/정지 버튼.
 * 상태만 DB에 쓰고, 실제 기동은 워커가 폴링해서 처리한다 — 그래서 즉시 반영되지 않는다.
 * 유저가 "눌렀는데 왜 그대로지?"라고 느끼지 않도록 대기 중임을 문구로 알린다.
 */
export function BotControls({ botId, status }: { botId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const running = status === 'running';

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await setBotStatus(botId, running ? 'stopped' : 'running');
      if ('error' in result) setError(result.error);
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={
          running
            ? 'rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-50'
            : 'rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50'
        }
      >
        {pending ? '처리 중…' : running ? '정지' : '시작'}
      </button>
      {error && <span className="text-xs text-loss">{error}</span>}
    </div>
  );
}
