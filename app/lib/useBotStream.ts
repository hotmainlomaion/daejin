'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BotEvent } from '@futureslab/shared';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * 봇의 실시간 스트림.
 *
 * 웹앱은 워커를 직접 호출하지 않으므로(CLAUDE.md 아키텍처 규칙), 워커가 뭘 했는지
 * 화면에 알리는 유일한 경로가 **DB 변경 이벤트**다. 폴링 대신 Supabase Realtime을 쓴다.
 *
 * 두 가지를 다르게 처리한다:
 *  - bot_events: append-only라 새 행을 로컬 목록에 바로 붙인다 (즉시 반영, 재조회 없음)
 *  - positions/trades/bots: 갱신·삭제가 섞여 있어 router.refresh()로 서버에서 다시 읽는다
 *    (직접 병합하면 워커의 upsert 순서와 어긋날 수 있다)
 *
 * RLS가 걸려 있으므로 본인 봇의 행만 전달된다.
 */
export function useBotStream(botId: string, initialEvents: BotEvent[]) {
  const router = useRouter();
  const [events, setEvents] = useState<BotEvent[]>(initialEvents);
  const [connected, setConnected] = useState(false);

  // 서버가 새 목록을 내려주면(=router.refresh 이후) 로컬 상태를 맞춘다.
  useEffect(() => {
    setEvents(initialEvents);
  }, [initialEvents]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const filter = `bot_id=eq.${botId}`;

    const channel = supabase
      .channel(`bot:${botId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bot_events', filter },
        (payload) => {
          const r = payload.new as {
            id: string;
            action: BotEvent['action'];
            reason: string;
            price: string | number | null;
            created_at: string;
          };
          setEvents((prev) => {
            if (prev.some((e) => e.id === r.id)) return prev; // 재연결 시 중복 방지
            const next: BotEvent = {
              id: r.id,
              botId,
              action: r.action,
              reason: r.reason,
              price: r.price === null ? null : Number(r.price),
              createdAt: r.created_at,
            };
            // 최신이 위. 화면에 보이는 만큼만 들고 있는다.
            return [next, ...prev].slice(0, 100);
          });
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions', filter }, () =>
        router.refresh(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades', filter }, () =>
        router.refresh(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bots', filter: `id=eq.${botId}` }, () =>
        router.refresh(),
      )
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'));

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [botId, router]);

  return { events, connected };
}
