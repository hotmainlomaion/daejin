/**
 * 테스트넷 한계 고지 (CLAUDE.md §"테스트넷 한계는 기능이 아니라 UX 고지 대상", PRD F8).
 *
 * 이 문구는 규제 포지셔닝의 일부다 — 숨기거나 약화시키지 않는다.
 * "수익", "보장", "기대수익률" 류 표현을 넣지 않는다 (가드레일 3).
 */
export function TestnetNotice({ variant = 'banner' }: { variant?: 'banner' | 'inline' }) {
  if (variant === 'inline') {
    return (
      <p className="text-xs leading-relaxed text-neutral-500">
        테스트넷 결과는 전략 로직 검증용이며 실전 성과를 보장하지 않습니다. 테스트넷은 유동성과
        슬리피지가 실제 시장과 다릅니다.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm font-medium text-amber-900">테스트넷 시뮬레이션입니다</p>
      <p className="mt-1 text-sm leading-relaxed text-amber-800">
        이 서비스는 바이낸스 <strong>테스트넷</strong>에서만 동작하는 교육·검증 시뮬레이터입니다.
        실제 자금은 사용되지 않습니다. 테스트넷은 유동성이 실제와 달라 체결이 비현실적으로 쉽고
        슬리피지가 현실적이지 않으므로, 결과는 <strong>전략 로직 검증용</strong>이며 실전 성과를
        보장하지 않습니다.
      </p>
    </div>
  );
}
