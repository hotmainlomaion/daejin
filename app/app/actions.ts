'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { encryptSecret } from '@futureslab/shared/crypto';
import { MA_CROSSOVER_DEFAULTS, validateMaCrossoverParams } from '@futureslab/shared';
import type { MaCrossoverParams } from '@futureslab/shared';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export type ActionResult = { error: string } | { ok: true };

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

/**
 * 테스트넷 키 등록.
 *
 * 평문 키는 이 서버 액션 안에서만 존재하고, 암호화한 뒤 즉시 버려진다.
 * DB에는 암호문만 들어가며, 복호화는 워커에서만 한다 (CLAUDE.md 가드레일 5·6).
 * 평문·암호문 어느 것도 로그에 찍지 않는다 (가드레일 8).
 */
export async function registerExchangeKey(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { user } = await requireUser();

  const apiKey = String(formData.get('apiKey') ?? '').trim();
  const secret = String(formData.get('secret') ?? '').trim();
  const label = String(formData.get('label') ?? '').trim() || '테스트넷 키';

  if (!apiKey || !secret) {
    return { error: 'API 키와 시크릿을 모두 입력하세요.' };
  }

  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    // 키가 없는데 평문으로 저장하는 일은 절대 없어야 한다. 차라리 실패시킨다.
    return { error: '서버 설정 오류: 암호화 키가 없습니다. 관리자에게 문의하세요.' };
  }

  let encryptedApiKey: string;
  let encryptedSecret: string;
  try {
    encryptedApiKey = encryptSecret(apiKey, encryptionKey);
    encryptedSecret = encryptSecret(secret, encryptionKey);
  } catch {
    // 예외 메시지에 키 조각이 섞일 수 있으므로 원문을 그대로 노출하지 않는다.
    return { error: '서버 설정 오류: 암호화 키 형식이 올바르지 않습니다.' };
  }

  // exchange_keys는 authenticated에 insert 권한이 없다 → service_role로 기록.
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('exchange_keys').insert({
    user_id: user.id,
    label,
    encrypted_api_key: encryptedApiKey,
    encrypted_secret: encryptedSecret,
  });

  if (error) {
    return { error: '키 저장에 실패했습니다. 다시 시도해주세요.' };
  }

  revalidatePath('/keys');
  redirect('/dashboard');
}

/** 봇 생성 — 전략을 만들고 봇을 정지 상태로 붙인다. */
export async function createBot(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const exchangeKeyId = String(formData.get('exchangeKeyId') ?? '');
  if (!exchangeKeyId) return { error: '테스트넷 키를 먼저 등록하세요.' };

  const symbol = String(formData.get('symbol') ?? MA_CROSSOVER_DEFAULTS.symbol);
  const timeframe = String(formData.get('timeframe') ?? MA_CROSSOVER_DEFAULTS.timeframe);
  const leverage = Number(formData.get('leverage') ?? MA_CROSSOVER_DEFAULTS.leverage);

  const params: MaCrossoverParams = {
    symbol,
    timeframe,
    leverage,
    positionSizePct: Number(formData.get('positionSizePct') ?? MA_CROSSOVER_DEFAULTS.positionSizePct),
    stopLossPct: Number(formData.get('stopLossPct') ?? MA_CROSSOVER_DEFAULTS.stopLossPct),
    takeProfitPct: Number(formData.get('takeProfitPct') ?? MA_CROSSOVER_DEFAULTS.takeProfitPct),
    fastPeriod: Number(formData.get('fastPeriod') ?? MA_CROSSOVER_DEFAULTS.fastPeriod),
    slowPeriod: Number(formData.get('slowPeriod') ?? MA_CROSSOVER_DEFAULTS.slowPeriod),
    maType: (formData.get('maType') as 'SMA' | 'EMA') ?? MA_CROSSOVER_DEFAULTS.maType,
    onDeadCross: (formData.get('onDeadCross') as 'SHORT' | 'CLOSE_ONLY') ?? 'CLOSE_ONLY',
  };

  // 워커가 DB 값을 그대로 믿지 않도록 여기서도 막지만, 저장 전에 먼저 거른다.
  const invalid = validateMaCrossoverParams(params);
  if (invalid) return { error: invalid };

  if (!Number.isFinite(leverage) || leverage < 1 || leverage > 125) {
    return { error: '레버리지는 1~125 사이여야 합니다.' };
  }

  const { data: strategy, error: strategyError } = await supabase
    .from('strategies')
    .insert({
      user_id: user.id,
      name: String(formData.get('name') ?? '이평선 교차 전략'),
      template_type: 'ma_crossover',
      params,
    })
    .select('id')
    .single();

  if (strategyError || !strategy) return { error: '전략 저장에 실패했습니다.' };

  const { error: botError } = await supabase.from('bots').insert({
    user_id: user.id,
    strategy_id: strategy.id,
    exchange_key_id: exchangeKeyId,
    symbol,
    timeframe,
    leverage,
    status: 'stopped',
  });

  if (botError) return { error: '봇 생성에 실패했습니다.' };

  revalidatePath('/dashboard');
  redirect('/dashboard');
}

/**
 * 터미널 봇 패널에서 바꾼 설정을 저장한다.
 *
 * 레버리지는 bots에, 나머지 전략 파라미터는 strategies.params에 들어간다.
 * 실행 중에 바꾸면 워커가 다음 기동 때 읽으므로, 즉시 반영하려면 재시작이 필요하다.
 */
export async function saveBotConfig(
  botId: string,
  config: {
    positionSizePct: number;
    leverage: number;
    stopLossPct: number;
    takeProfitPct: number;
    fastPeriod: number;
    slowPeriod: number;
    maType: 'SMA' | 'EMA';
    onDeadCross: 'SHORT' | 'CLOSE_ONLY';
  },
): Promise<ActionResult> {
  const { supabase } = await requireUser();

  if (!Number.isFinite(config.leverage) || config.leverage < 1 || config.leverage > 125) {
    return { error: '레버리지는 1~125 사이여야 합니다.' };
  }
  if (config.positionSizePct <= 0 || config.positionSizePct > 100) {
    return { error: '진입 규모는 0보다 크고 100% 이하여야 합니다.' };
  }

  // RLS가 남의 봇을 막아준다. 봇의 전략 id는 서버에서 다시 조회해 신뢰한다.
  const { data: bot, error: botErr } = await supabase
    .from('bots')
    .select('strategy_id, symbol, timeframe')
    .eq('id', botId)
    .single();
  if (botErr || !bot) return { error: '봇을 찾을 수 없습니다.' };

  const params: MaCrossoverParams = {
    symbol: bot.symbol,
    timeframe: bot.timeframe,
    leverage: config.leverage,
    positionSizePct: config.positionSizePct,
    stopLossPct: config.stopLossPct,
    takeProfitPct: config.takeProfitPct,
    fastPeriod: config.fastPeriod,
    slowPeriod: config.slowPeriod,
    maType: config.maType,
    onDeadCross: config.onDeadCross,
  };

  const invalid = validateMaCrossoverParams(params);
  if (invalid) return { error: invalid };

  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabase.from('strategies').update({ params }).eq('id', bot.strategy_id),
    supabase.from('bots').update({ leverage: config.leverage }).eq('id', botId),
  ]);
  if (e1 || e2) return { error: '설정 저장에 실패했습니다.' };

  revalidatePath('/dashboard');
  return { ok: true };
}

/**
 * 봇 시작/정지.
 * 웹앱은 status만 바꾼다 — 워커를 직접 호출하지 않는다 (CLAUDE.md 아키텍처 규칙).
 * 워커가 이 값을 폴링해서 실제로 띄우고 내린다.
 */
export async function setBotStatus(botId: string, status: 'running' | 'stopped'): Promise<ActionResult> {
  const { supabase } = await requireUser();

  const patch: Record<string, unknown> = { status };
  if (status === 'running') {
    patch.started_at = new Date().toISOString();
    patch.last_error = null;
  }

  // RLS가 남의 봇을 막아주므로 user_id 조건을 따로 걸지 않아도 된다.
  const { error } = await supabase.from('bots').update(patch).eq('id', botId);
  if (error) return { error: '봇 상태 변경에 실패했습니다.' };

  revalidatePath('/dashboard');
  return { ok: true };
}
