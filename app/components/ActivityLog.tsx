'use client';

import { useMemo } from 'react';
import type { BotEvent } from '@futureslab/shared';
import { ExplainButton } from '@/components/ExplainButton';

/**
 * 봇 활동 로그 — 이 화면의 존재 이유에 가장 가까운 패널.
 *
 * 봇은 캔들 종가에만 판단하므로 체결이 없는 동안에도 "무엇을 보고 있는지"가 보여야 한다.
 * 다만 그대로 늘어놓으면 1분마다 "교차 없음"이 똑같이 쌓이는 벽이 된다.
 * → **연속된 같은 판단은 하나로 접는다.** 접힌 항목은 몇 번째인지·언제부터인지 보여준다.
 *
 * 선물을 모르는 유저 기준으로 사유를 쉬운 말로 바꿔 보여주되, 원문(전략이 남긴 reason)도
 * 같이 남긴다 — 아는 사람에겐 원문이 더 정확하다.
 */
interface Group {
  key: string;
  action: BotEvent['action'];
  reason: string;
  count: number;
  /** 그룹에서 가장 최근 이벤트 */
  latest: BotEvent;
  /** 그룹에서 가장 오래된 이벤트 */
  oldest: BotEvent;
}

export function ActivityLog({ events, botId }: { events: BotEvent[]; botId: string }) {
  // events는 최신순으로 들어온다. 연속으로 같은 (action, reason)이면 하나로 묶는다.
  const groups = useMemo<Group[]>(() => {
    const out: Group[] = [];
    for (const e of events) {
      const head = out[out.length - 1];
      if (head && head.action === e.action && head.reason === e.reason) {
        head.count += 1;
        head.oldest = e;
        continue;
      }
      out.push({ key: e.id, action: e.action, reason: e.reason, count: 1, latest: e, oldest: e });
    }
    return out;
  }, [events]);

  if (events.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-[11px] leading-relaxed text-faint">
        아직 기록이 없습니다.
        <br />
        봇을 시작하면 캔들이 마감될 때마다 판단 근거가 여기 쌓입니다.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line/50">
      {groups.map((g) => (
        <li key={g.key} className="flex items-start gap-2 px-4 py-2">
          <ActionTag action={g.action} />
          <div className="min-w-0 flex-1">
            <p className="break-words text-[11px] leading-relaxed text-ink">
              {plainLanguage(g.action, g.reason)}
            </p>
            <p className="mt-0.5 font-mono text-[10px] text-faint">
              {new Date(g.latest.createdAt).toLocaleTimeString('ko-KR')}
              {g.latest.price !== null &&
                ` · ${g.latest.price.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}`}
              {g.count > 1 && (
                <span className="ml-1.5 text-muted">
                  · {g.count}회 연속 (
                  {new Date(g.oldest.createdAt).toLocaleTimeString('ko-KR')}부터)
                </span>
              )}
            </p>
            {/* 대기(HOLD)는 해설할 게 없다 — 실제로 뭔가 일어난 항목에만 붙인다.
                자동 호출이 아니라 유저가 눌러야 부른다 (비용). */}
            {g.action !== 'HOLD' && <ExplainButton botId={botId} eventId={g.latest.id} />}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * 전략이 남긴 사유를 선물 초보가 읽을 수 있는 문장으로 바꾼다.
 *
 * ⚠️ 원문에 없는 정보를 지어내지 않는다. 예측·추천도 하지 않는다 (가드레일 2·3).
 *    매칭되지 않는 사유는 원문을 그대로 보여준다 — 억지로 바꾸다 뜻이 틀어지는 것보다 낫다.
 */
function plainLanguage(action: BotEvent['action'], reason: string): string {
  if (reason === '교차 없음') {
    return '두 이평선이 아직 교차하지 않았습니다 — 진입 조건을 기다리는 중';
  }
  if (reason.startsWith('캔들 부족')) {
    return `이평선을 계산할 캔들이 아직 모이지 않았습니다 (${reason.replace('캔들 부족 ', '')})`;
  }
  if (reason.includes('골든크로스')) {
    return reason.includes('청산')
      ? '단기선이 장기선을 위로 뚫었습니다 — 들고 있던 숏을 정리합니다'
      : '단기선이 장기선을 위로 뚫었습니다 (골든크로스) — 매수합니다';
  }
  if (reason.includes('데드크로스')) {
    if (reason.includes('청산')) return '단기선이 장기선을 아래로 뚫었습니다 — 들고 있던 롱을 정리합니다';
    if (reason.includes('청산 전용')) return '단기선이 아래로 뚫었지만, 숏 진입은 하지 않는 설정입니다';
    return '단기선이 장기선을 아래로 뚫었습니다 (데드크로스) — 매도(숏)합니다';
  }
  if (reason.startsWith('손절 도달')) {
    return `손절선에 닿아 손실을 확정하고 나왔습니다 ${reason.replace('손절 도달 ', '')}`;
  }
  if (reason.startsWith('익절 도달')) {
    return `익절선에 닿아 포지션을 정리했습니다 ${reason.replace('익절 도달 ', '')}`;
  }
  if (reason.startsWith('이미 롱')) return '이미 롱을 들고 있어 중복 진입하지 않습니다';
  if (reason.startsWith('이미 숏')) return '이미 숏을 들고 있어 중복 진입하지 않습니다';
  if (action === 'ERROR') return reason; // 오류는 원문이 정확하다
  return reason;
}

function ActionTag({ action }: { action: BotEvent['action'] }) {
  const map: Record<BotEvent['action'], [string, string]> = {
    LONG: ['매수', 'bg-long/15 text-long'],
    SHORT: ['매도', 'bg-short/15 text-short'],
    CLOSE: ['정리', 'bg-[#f0b90b]/15 text-[#f0b90b]'],
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
