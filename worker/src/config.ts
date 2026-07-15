/**
 * 워커 설정 + 테스트넷 강제.
 *
 * CLAUDE.md 가드레일 1: "메인넷(실계좌) 연동 코드 금지. API 베이스 URL은 항상 테스트넷."
 * 그래서 베이스 URL을 하드코딩하지 않고, **허용된 테스트넷 호스트만 통과**시킨다.
 * 설정 실수로 메인넷을 향하면 워커가 주문을 내기 전에 기동 자체를 실패한다.
 */

/**
 * 허용 호스트 화이트리스트.
 *
 * TODO(confirm): 바이낸스 공식 문서상 테스트넷 주소가 두 계열로 갈린다.
 *   - general-info 페이지: demo-fapi.binance.com / demo-fstream.binance.com
 *   - 구 changelog·커뮤니티: testnet.binancefuture.com / fstream.binancefuture.com
 * week1.md Day 0에서 실제로 어느 쪽이 살아있는지 손으로 확인한 뒤 하나로 좁힐 것.
 * 확인 전까지 양쪽 다 허용하되, 기본값은 공식 문서 기준(demo-*)으로 둔다.
 */
const ALLOWED_REST_HOSTS = ['demo-fapi.binance.com', 'testnet.binancefuture.com'] as const;

const ALLOWED_WS_HOSTS = [
  'demo-fstream.binance.com',
  'fstream.binancefuture.com',
  'stream.binancefuture.com',
] as const;

const DEFAULT_REST_BASE = 'https://demo-fapi.binance.com';
const DEFAULT_WS_BASE = 'wss://demo-fstream.binance.com';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`환경변수 ${name}가 설정되지 않았습니다. .env.example을 참고하세요.`);
  }
  return value;
}

/**
 * 베이스 URL이 테스트넷 화이트리스트에 있는지 확인한다.
 * 메인넷(fapi.binance.com 등)이면 여기서 막힌다.
 */
function assertTestnetUrl(raw: string, allowed: readonly string[], label: string): string {
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

  // 뒤 슬래시를 없애 경로 조합 시 //가 생기지 않게 한다.
  return raw.replace(/\/+$/, '');
}

export interface WorkerConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  encryptionKey: string;
  binanceRestBase: string;
  binanceWsBase: string;
  pollIntervalMs: number;
}

export function loadConfig(): WorkerConfig {
  const restBase = assertTestnetUrl(
    process.env.BINANCE_TESTNET_REST_BASE ?? DEFAULT_REST_BASE,
    ALLOWED_REST_HOSTS,
    'REST',
  );
  const wsBase = assertTestnetUrl(
    process.env.BINANCE_TESTNET_WS_BASE ?? DEFAULT_WS_BASE,
    ALLOWED_WS_HOSTS,
    'WebSocket',
  );

  const pollRaw = process.env.WORKER_POLL_INTERVAL_MS ?? '5000';
  const pollIntervalMs = Number.parseInt(pollRaw, 10);
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 1000) {
    throw new Error(`WORKER_POLL_INTERVAL_MS는 1000 이상의 정수여야 합니다 (현재: ${pollRaw}).`);
  }

  return {
    supabaseUrl: requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    encryptionKey: requireEnv('ENCRYPTION_KEY'),
    binanceRestBase: restBase,
    binanceWsBase: wsBase,
    pollIntervalMs,
  };
}

// 테스트에서 화이트리스트 동작을 검증하기 위해 노출한다.
export const __testing = { assertTestnetUrl, ALLOWED_REST_HOSTS, ALLOWED_WS_HOSTS };
