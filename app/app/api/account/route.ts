import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { resolveRestBase } from '@futureslab/shared';
import { decryptSecret } from '@futureslab/shared/crypto';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * 로그인한 유저의 테스트넷 계정 잔고 (USDT).
 *
 * 흐름: 세션 확인 → service_role로 암호문 조회 → 복호화 → 테스트넷 서명 호출.
 *
 * ⚠️ 보안 (CLAUDE.md 가드레일 6·8):
 *  - 복호화된 키·시크릿·서명·요청 URL은 이 함수 밖으로 절대 나가지 않는다.
 *    응답·에러 어디에도 싣지 않으며 로그로도 찍지 않는다.
 *  - 바이낸스 에러는 msg만 골라 전달한다 (원문에는 쿼리스트링이 섞일 수 있다).
 */
export const dynamic = 'force-dynamic';

/**
 * 바이낸스 /fapi/v2/balance 응답 (자산별 배열).
 * 2026-07-15 demo-fapi 실측 필드: accountAlias, asset, balance, crossWalletBalance,
 * crossUnPnl, availableBalance, maxWithdrawAmount, marginAvailable, updateTime.
 *
 * TODO(confirm): 이 엔드포인트에는 walletBalance·unrealizedPnl 필드가 없다.
 *   현재 매핑은 walletBalance ← balance, unrealizedPnl ← crossUnPnl(크로스 마진 기준)이다.
 *   격리(isolated) 마진 포지션의 미실현손익은 crossUnPnl에 포함되지 않으므로,
 *   격리 모드를 지원하게 되면 /fapi/v2/account 또는 positionRisk 기준으로 바꿔야 한다.
 *   MVP는 크로스 마진만 쓰므로 일단 이대로 둔다.
 */
interface BinanceBalance {
  asset: string;
  balance: string;
  crossUnPnl: string;
  availableBalance: string;
}

export async function GET() {
  // (a) 세션 확인 — 남의 잔고를 못 보게 하는 유일한 방어선이다.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  let base: string;
  try {
    base = resolveRestBase(process.env.BINANCE_TESTNET_REST_BASE);
  } catch (err) {
    // 메인넷 설정이면 여기서 막힌다
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '테스트넷 설정 오류' },
      { status: 500 },
    );
  }

  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    return NextResponse.json(
      { error: '서버 설정 오류: 암호화 키가 없습니다. 관리자에게 문의하세요.' },
      { status: 500 },
    );
  }

  // (b) authenticated는 암호문 컬럼 select 권한이 없다(마이그레이션의 컬럼 단위 grant).
  //     따라서 service_role로만 읽을 수 있다. user_id를 직접 걸어 남의 행이 섞이지 않게 한다
  //     — admin 클라이언트는 RLS를 우회하므로 이 조건이 곧 접근 제어다.
  // TODO(confirm): 키를 여러 개 등록한 유저는 가장 최근 것을 쓴다.
  //   봇별로 exchange_key_id가 따로 있으므로, 대시보드가 봇 단위 잔고를 보여주게 되면
  //   쿼리 파라미터로 키를 지정받도록 바꿀 것.
  const admin = createSupabaseAdminClient();
  const { data: keyRow, error: keyError } = await admin
    .from('exchange_keys')
    .select('encrypted_api_key, encrypted_secret')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (keyError) {
    return NextResponse.json({ error: '키 조회에 실패했습니다.' }, { status: 500 });
  }
  if (!keyRow) {
    return NextResponse.json({ error: '등록된 테스트넷 키가 없습니다.' }, { status: 400 });
  }

  // (c) 복호화 — 평문 키는 이 함수 스코프를 벗어나지 않는다.
  let apiKey: string;
  let secret: string;
  try {
    apiKey = decryptSecret(keyRow.encrypted_api_key, encryptionKey);
    secret = decryptSecret(keyRow.encrypted_secret, encryptionKey);
  } catch {
    // 예외 메시지에 키 조각이 섞일 수 있으므로 원문을 그대로 노출하지 않는다.
    return NextResponse.json(
      { error: '키를 복호화할 수 없습니다. 키를 다시 등록해주세요.' },
      { status: 500 },
    );
  }

  try {
    // (d) 서명: totalParams 문자열 그대로를 HMAC → signature로 첨부.
    //     서명한 문자열과 실제로 보내는 문자열이 반드시 같아야 한다 (순서·인코딩 포함).
    // TODO(confirm): recvWindow 5000ms — 서버-바이낸스 시계 차가 크면 -1021이 난다.
    const totalParams = `timestamp=${Date.now()}&recvWindow=5000`;
    const signature = createHmac('sha256', secret).update(totalParams).digest('hex');

    const res = await fetch(`${base}/fapi/v2/balance?${totalParams}&signature=${signature}`, {
      method: 'GET',
      headers: { 'X-MBX-APIKEY': apiKey },
      cache: 'no-store',
    });

    if (!res.ok) {
      // 바이낸스 에러 형식: {"code":-2015,"msg":"Invalid API-key..."}
      // ⚠️ 응답 원문(url 포함 가능)을 그대로 흘리지 않고 msg만 뽑는다.
      let msg = '테스트넷 계정 조회에 실패했습니다.';
      try {
        const body = (await res.json()) as { msg?: string };
        if (typeof body.msg === 'string') msg = body.msg;
      } catch {
        // JSON이 아니면 기본 메시지를 쓴다 (원문은 버린다)
      }
      return NextResponse.json({ error: `바이낸스 오류: ${msg}` }, { status: 502 });
    }

    const balances = (await res.json()) as BinanceBalance[];

    // (e) USDT만. 선물 계정에 USDT가 아직 없으면 0으로 본다.
    const usdt = balances.find((b) => b.asset === 'USDT');

    return NextResponse.json({
      walletBalance: usdt ? Number.parseFloat(usdt.balance) : 0,
      availableBalance: usdt ? Number.parseFloat(usdt.availableBalance) : 0,
      unrealizedPnl: usdt ? Number.parseFloat(usdt.crossUnPnl) : 0,
    });
  } catch {
    // ⚠️ fetch 예외 메시지에는 서명이 붙은 URL이 들어있을 수 있다 → detail을 싣지 않는다.
    return NextResponse.json({ error: '테스트넷에 연결할 수 없습니다.' }, { status: 502 });
  }
}
