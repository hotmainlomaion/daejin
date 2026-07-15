import Anthropic from '@anthropic-ai/sdk';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * 봇의 판단 근거를 AI가 해설한다.
 *
 * 봇의 판단 자체는 이미 결정론적으로 끝나 있다(`bot_events.reason`). AI는 그걸
 * **설명만** 한다 — 판단하거나 예측하거나 권유하지 않는다.
 *
 * ⚠️ 비용 때문에 **자동 호출하지 않는다.** 1분봉이면 봇 하나당 하루 1,440회가 되는데
 *    대부분이 "교차 없음"이라 해설할 가치가 없다. 유저가 특정 이벤트를 눌렀을 때만 부른다.
 *
 * ⚠️ 가드레일 3은 완화 대상이 아니다 (CLAUDE.md §AI 기능):
 *    "수익 보장"·"기대수익률" 류 표현은 시스템 프롬프트로 계속 막는다.
 */
export const dynamic = 'force-dynamic';

/**
 * 프롬프트 캐싱은 쓰지 않는다.
 * Opus 4.8의 최소 캐시 가능 프리픽스는 4096 토큰인데 이 시스템 프롬프트는 그보다 훨씬
 * 짧아서 조용히 캐시되지 않는다 (cache_control을 붙여도 쓰기 프리미엄만 낸다).
 */
const SYSTEM_PROMPT = `당신은 선물 자동매매 **검증 시뮬레이터**의 해설자입니다.
봇이 이미 내린 판단을 사용자에게 쉬운 한국어로 설명하는 것이 유일한 역할입니다.

## 반드시 지킬 것
- 봇의 판단 근거를 **설명**만 합니다. 사용자는 선물 거래를 잘 모를 수 있습니다.
- 주어진 데이터에 없는 내용을 지어내지 마세요. 모르면 모른다고 하세요.
- 2~4문장으로 짧게. 전문용어를 쓰면 즉시 풀어서 설명하세요.

## 절대 하지 말 것
- **가격 예측 금지.** "오를 것", "내릴 것", "곧 반등" 같은 표현을 쓰지 마세요.
- **매매 권유 금지.** "지금 사세요", "이 전략이 좋습니다" 같은 제안을 하지 마세요.
- **수익 보장·기대수익률 표현 금지.** "벌 수 있다", "수익률 N%가 기대된다" 류를 쓰지 마세요.
  이것은 규제 요구사항이며 예외가 없습니다.
- 사용자가 "지금 사야 할까?", "이 전략 어때?"라고 물으면, 판단을 대신 내려주는 대신
  **봇이 무엇을 보고 어떻게 판단하는지** 설명하고 결정은 사용자 몫임을 알리세요.

## 맥락
- 이 봇은 **바이낸스 테스트넷**에서만 동작합니다. 실제 자금이 아닙니다.
- 봇은 캔들이 마감될 때만 판단합니다. 캔들 중간 가격으로는 움직이지 않습니다.
- 손절·익절은 진입가 대비 가격 변동률 기준이며 레버리지가 반영되지 않은 값입니다.`;

interface ExplainRequest {
  botId: string;
  eventId: string;
}

export async function POST(request: Request) {
  // 인증을 먼저 확인한다. 키 확인이 앞서면 로그인하지 않은 사람도 응답 코드로
  // "AI가 설정되어 있는지"를 알아낼 수 있다 — 설정 상태도 노출하지 않는다.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'AI 해설이 설정되지 않았습니다. 관리자에게 문의하세요.' },
      { status: 503 },
    );
  }

  let body: ExplainRequest;
  try {
    body = (await request.json()) as ExplainRequest;
  } catch {
    return Response.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  // RLS가 본인 봇의 이벤트만 반환한다 — 남의 것이면 여기서 걸린다
  const { data: event } = await supabase
    .from('bot_events')
    .select('action, reason, price, created_at, bot_id')
    .eq('id', body.eventId)
    .single();

  if (!event) return Response.json({ error: '이벤트를 찾을 수 없습니다.' }, { status: 404 });

  const { data: bot } = await supabase
    .from('bots')
    .select('symbol, timeframe, leverage, strategies(name, params)')
    .eq('id', event.bot_id)
    .single();

  if (!bot) return Response.json({ error: '봇을 찾을 수 없습니다.' }, { status: 404 });

  const params = (bot.strategies as unknown as { params?: Record<string, unknown> })?.params ?? {};

  // AI에게 넘기는 것은 봇의 설정과 이 이벤트뿐이다. 시크릿은 절대 포함하지 않는다.
  const context = [
    `## 봇 설정`,
    `- 심볼: ${bot.symbol} (${bot.timeframe} 봉)`,
    `- 레버리지: ${bot.leverage}배`,
    `- 전략: 이평선 교차 — 단기 ${params.maType ?? 'EMA'} ${params.fastPeriod ?? '?'}, 장기 ${params.maType ?? 'EMA'} ${params.slowPeriod ?? '?'}`,
    `- 손절 ${params.stopLossPct ?? '?'}% / 익절 ${params.takeProfitPct ?? '?'}%`,
    `- 데드크로스 시: ${params.onDeadCross === 'SHORT' ? '숏 진입' : '롱 청산만'}`,
    ``,
    `## 해설할 판단`,
    `- 시각: ${new Date(event.created_at).toLocaleString('ko-KR')}`,
    `- 봇의 행동: ${event.action}`,
    `- 봇이 기록한 사유: "${event.reason}"`,
    event.price !== null ? `- 그 시점 가격: ${Number(event.price).toLocaleString('ko-KR')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const client = new Anthropic({ apiKey });

  try {
    // 스트리밍으로 받는다 — 해설이 한 번에 나타나는 것보다 흘러나오는 게 기다림이 짧게 느껴진다.
    const stream = client.messages.stream({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      // 짧은 해설이라 깊은 추론이 필요 없다. effort를 낮춰 지연과 비용을 줄인다.
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      messages: [
        {
          role: 'user',
          content: `${context}\n\n위 판단을 선물 거래를 처음 접하는 사람에게 설명해주세요.`,
        },
      ],
    });

    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(chunk.delta.text));
            }
          }
          const final = await stream.finalMessage();
          // 안전 분류기가 거절하면 content가 비어 있을 수 있다 — 조용히 빈 응답을 내지 않는다.
          if (final.stop_reason === 'refusal') {
            controller.enqueue(encoder.encode('\n\n(해설을 생성할 수 없는 요청입니다.)'));
          }
        } catch (err) {
          // ⚠️ 에러 메시지에 API 키가 섞이지 않도록 원문을 그대로 흘리지 않는다.
          console.error('AI 해설 실패:', err instanceof Error ? err.message : err);
          controller.enqueue(encoder.encode('\n\n(해설을 불러오지 못했습니다.)'));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(body, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json({ error: '요청이 많습니다. 잠시 후 다시 시도하세요.' }, { status: 429 });
    }
    console.error('AI 해설 실패:', err instanceof Error ? err.message : err);
    return Response.json({ error: '해설을 불러오지 못했습니다.' }, { status: 502 });
  }
}
