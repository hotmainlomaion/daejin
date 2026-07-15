'use client';

import { useState } from 'react';

/**
 * 봇의 판단 하나를 AI에게 해설시킨다.
 *
 * ⚠️ 자동 호출하지 않고 **유저가 눌렀을 때만** 부른다. 1분봉이면 하루 1,440건이 쌓이는데
 *    전부 자동 해설하면 봇 하나당 하루 $10 수준이고, 대부분이 "교차 없음"이라 값어치가 없다.
 */
export function ExplainButton({ botId, eventId }: { botId: string; eventId: string }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function explain() {
    if (loading || text) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId, eventId }),
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? '해설을 불러오지 못했습니다.');
        return;
      }

      // 스트리밍 — 글자가 흘러나와야 기다림이 짧게 느껴진다
      const reader = res.body?.getReader();
      if (!reader) return setError('해설을 불러오지 못했습니다.');
      const decoder = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setText(acc);
      }
    } catch {
      setError('해설 서버에 연결할 수 없습니다.');
    } finally {
      setLoading(false);
    }
  }

  if (text || error) {
    return (
      <div className="mt-1.5 rounded bg-canvas px-2 py-1.5">
        <p className={`text-[11px] leading-relaxed ${error ? 'text-short' : 'text-muted'}`}>
          {error ?? text}
          {loading && <span className="ml-0.5 animate-pulse text-brand">▊</span>}
        </p>
        {!error && !loading && (
          <p className="mt-1 text-[9px] text-faint">
            AI가 봇의 기록을 설명한 것입니다. 투자 판단은 사용자 몫입니다.
          </p>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={explain}
      disabled={loading}
      className="mt-0.5 text-[10px] text-faint underline underline-offset-2 transition hover:text-brand disabled:opacity-50"
    >
      {loading ? 'AI가 설명하는 중…' : '이게 무슨 뜻인가요?'}
    </button>
  );
}
