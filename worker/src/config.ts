/**
 * 워커 설정.
 *
 * 테스트넷 강제(가드레일 1)는 @futureslab/shared/testnet에 있다 — 웹앱과 같은 규칙을 쓴다.
 * 메인넷 URL이 설정되면 loadConfig()가 throw하고 워커는 주문을 내기 전에 기동을 실패한다.
 */
import { resolveRestBase, resolveWsBase } from '@futureslab/shared';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`환경변수 ${name}가 설정되지 않았습니다. .env.example을 참고하세요.`);
  }
  return value;
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
  const restBase = resolveRestBase(process.env.BINANCE_TESTNET_REST_BASE);
  const wsBase = resolveWsBase(process.env.BINANCE_TESTNET_WS_BASE);

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
