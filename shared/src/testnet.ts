/**
 * 테스트넷 강제 — CLAUDE.md 가드레일 1의 코드적 이행.
 *
 * "메인넷(실계좌) 연동 코드 금지. API 베이스 URL은 항상 테스트넷."
 * 베이스 URL을 하드코딩하는 대신 **허용된 테스트넷 호스트만 통과**시킨다.
 * 설정 실수로 메인넷을 향하면 요청이 나가기 전에 throw한다.
 *
 * ⚠️ 워커와 웹앱이 **이 파일 하나만** 쓴다. 규칙이 두 벌이 되면 한쪽만 뚫린다.
 */

/**
 * 허용 호스트 화이트리스트.
 *
 * TODO(confirm): 공식 문서상 테스트넷 주소가 두 계열로 갈린다.
 *   - developers.binance.com general-info: demo-fapi / demo-fstream
 *   - 프로젝트 문서·구 changelog: testnet.binancefuture.com / fstream.binancefuture.com
 * 2026-07-15 실측: demo-fapi.binance.com이 바이낸스 형식 에러(401 API-key format invalid)를
 * 응답하는 것을 확인 → 살아있음. binancefuture.com 계열은 아직 미확인.
 * week1.md Day 0에서 실제 키로 확인한 뒤 하나로 좁힐 것.
 */
export const ALLOWED_REST_HOSTS = ['demo-fapi.binance.com', 'testnet.binancefuture.com'] as const;

export const ALLOWED_WS_HOSTS = [
  'demo-fstream.binance.com',
  'fstream.binancefuture.com',
  'stream.binancefuture.com',
] as const;

export const DEFAULT_REST_BASE = 'https://demo-fapi.binance.com';
export const DEFAULT_WS_BASE = 'wss://demo-fstream.binance.com';

/**
 * 베이스 URL이 테스트넷 화이트리스트에 있는지 확인한다.
 * hostname 완전 일치로 비교하므로 `demo-fapi.binance.com.evil.io` 같은 유사 도메인은 막힌다.
 *
 * @returns 뒤 슬래시를 정리한 URL
 * @throws 메인넷이거나 해석 불가한 주소면
 */
export function assertTestnetUrl(raw: string, allowed: readonly string[], label: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${label} 주소를 해석할 수 없습니다: ${raw}`);
  }

  if (!allowed.includes(parsed.hostname)) {
    throw new Error(
      `🚫 ${label} 호스트 "${parsed.hostname}"는 테스트넷이 아닙니다.\n` +
        `이 프로젝트는 테스트넷 전용입니다 (CLAUDE.md 가드레일 1). 실계좌 연동은 지원하지 않습니다.\n` +
        `허용된 호스트: ${allowed.join(', ')}`,
    );
  }

  return raw.replace(/\/+$/, '');
}

/** 환경변수(또는 기본값)에서 테스트넷 REST 베이스를 얻는다. 메인넷이면 throw. */
export function resolveRestBase(envValue?: string): string {
  return assertTestnetUrl(envValue || DEFAULT_REST_BASE, ALLOWED_REST_HOSTS, 'REST');
}

/** 환경변수(또는 기본값)에서 테스트넷 WS 베이스를 얻는다. 메인넷이면 throw. */
export function resolveWsBase(envValue?: string): string {
  return assertTestnetUrl(envValue || DEFAULT_WS_BASE, ALLOWED_WS_HOSTS, 'WebSocket');
}
