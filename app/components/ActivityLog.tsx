'use client';

import type { BotEvent } from '@futureslab/shared';

/**
 * 봇 활동 로그 — 이 화면의 존재 이유에 가장 가까운 패널.
 *
 * 봇은 캔들 종가에만 판단하므로 15분봉이면 체결이 몇 시간에 한 번이다. 그 사이 화면이
 * 죽어 보이면 유저는 봇이 돌고 있는지조차 알 수 없다. HOLD("교차 없음")까지 매 캔들
 * 찍어서 **봇이 살아있고 무엇을 보고 있는지**를 계속 보여준다.
 *
 * 이 제품은 검증 툴이므로 "봇이 왜 그렇게 판단했는지"가 결과 숫자보다 중요하다.
 */
export function ActivityLog({ events }: { events: BotEvent[] }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto">
        {events.length === 0 ? (
          <p className="px-4 py-8 text-center text-[11px] leading-relaxed text-faint">
            아직 기록이 없습니다.
            <br />
            봇을 시작하면 캔들이 마감될 때마다 판단 근거가 여기 쌓입니다.
          </p>
        ) : (
          <ul className="divide-y divide-line/50">
            {events.map((e) => (
              <li key={e.id} className="flex items-start gap-2 px-4 py-2">
                <ActionTag action={e.action} />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[11px] leading-relaxed text-ink">{e.reason}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-faint">
                    {new Date(e.createdAt).toLocaleTimeString('ko-KR')}
                    {e.price !== null &&
                      ` · ${e.price.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ActionTag({ action }: { action: BotEvent['action'] }) {
  const map: Record<BotEvent['action'], [string, string]> = {
    LONG: ['롱', 'bg-long/15 text-long'],
    SHORT: ['숏', 'bg-short/15 text-short'],
    CLOSE: ['청산', 'bg-[#f0b90b]/15 text-[#f0b90b]'],
    HOLD: ['대기', 'bg-elevated text-faint'],
    ERROR: ['오류', 'bg-short/15 text-short'],
  };
  const [label, cls] = map[action];
  return (
    <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {label}
    </span>
  );
}
