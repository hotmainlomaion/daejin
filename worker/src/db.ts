/**
 * Supabase 접근 (워커 전용).
 *
 * service_role 키를 쓰므로 RLS를 우회한다 — 이 클라이언트는 절대 클라이언트 코드로
 * 나가지 않는다 (CLAUDE.md 보안 가드레일 7).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { WorkerConfig } from './config.ts';

export interface BotRow {
  id: string;
  user_id: string;
  strategy_id: string;
  exchange_key_id: string;
  symbol: string;
  timeframe: string;
  leverage: number;
  status: 'stopped' | 'running' | 'error';
  started_at: string | null;
}

export interface StrategyRow {
  id: string;
  template_type: 'ma_crossover' | 'volatility_breakout' | 'rsi';
  params: Record<string, unknown>;
}

export interface ExchangeKeyRow {
  id: string;
  encrypted_api_key: string;
  encrypted_secret: string;
}

export function createDb(config: WorkerConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** 실행 중이어야 할 봇 목록. 웹앱은 status만 바꾸고 워커가 이 값을 폴링한다. */
export async function fetchRunningBots(db: SupabaseClient): Promise<BotRow[]> {
  const { data, error } = await db.from('bots').select('*').eq('status', 'running');
  if (error) throw new Error(`봇 목록 조회 실패: ${error.message}`);
  return (data ?? []) as BotRow[];
}

export async function fetchStrategy(db: SupabaseClient, id: string): Promise<StrategyRow> {
  const { data, error } = await db.from('strategies').select('*').eq('id', id).single();
  if (error) throw new Error(`전략 조회 실패: ${error.message}`);
  return data as StrategyRow;
}

export async function fetchExchangeKey(db: SupabaseClient, id: string): Promise<ExchangeKeyRow> {
  const { data, error } = await db.from('exchange_keys').select('*').eq('id', id).single();
  if (error) throw new Error(`거래소 키 조회 실패: ${error.message}`);
  return data as ExchangeKeyRow;
}

/** 봇을 오류 상태로 내린다. 사유는 유저에게 보이므로 시크릿을 넣지 않는다. */
export async function markBotError(db: SupabaseClient, botId: string, reason: string): Promise<void> {
  await db.from('bots').update({ status: 'error', last_error: reason.slice(0, 500) }).eq('id', botId);
}

export async function insertTrade(
  db: SupabaseClient,
  trade: {
    bot_id: string;
    side: 'BUY' | 'SELL';
    price: number;
    qty: number;
    exchange_order_id: string;
  },
): Promise<void> {
  // 재시작 시 같은 orderId가 다시 들어올 수 있다. 유니크 인덱스가 있으므로 무시한다.
  const { error } = await db.from('trades').upsert(trade, {
    onConflict: 'bot_id,exchange_order_id',
    ignoreDuplicates: true,
  });
  if (error) throw new Error(`체결 기록 실패: ${error.message}`);
}

export async function upsertPosition(
  db: SupabaseClient,
  position: {
    bot_id: string;
    symbol: string;
    entry_price: number;
    qty: number;
    unrealized_pnl: number;
    liquidation_price: number | null;
  },
): Promise<void> {
  const { error } = await db.from('positions').upsert(position, { onConflict: 'bot_id,symbol' });
  if (error) throw new Error(`포지션 갱신 실패: ${error.message}`);
}

export async function deletePosition(db: SupabaseClient, botId: string, symbol: string): Promise<void> {
  await db.from('positions').delete().eq('bot_id', botId).eq('symbol', symbol);
}
