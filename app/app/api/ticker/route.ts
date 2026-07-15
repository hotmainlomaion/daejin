import { NextResponse } from 'next/server';
import { resolveRestBase } from '@futureslab/shared';

/**
 * 마크 가격 프록시 (공개 데이터 — 키 불필요).
 *
 * klines 라우트와 같은 이유로 서버를 거친다: CORS 회피 + 테스트넷 호스트 강제(가드레일 1).
 *
 * ⚠️ 이 라우트는 초 단위로 폴링된다. 캐시에 걸리면 가격이 굳어버리므로
 *    force-dynamic + cache:'no-store'를 반드시 유지할 것.
 */
export const dynamic = 'force-dynamic';

/**
 * 바이낸스 /fapi/v1/premiumIndex 응답 (symbol 지정 시 단일 객체).
 * 2026-07-15 demo-fapi 실측 필드: symbol, markPrice, indexPrice, estimatedSettlePrice,
 * lastFundingRate, interestRate, nextFundingTime, time. 숫자는 전부 문자열로 온다.
 */
interface PremiumIndex {
  symbol: string;
  markPrice: string;
}

// 심볼은 화이트리스트가 아니라 형식으로 막는다 (BTCUSDT 류만 허용) — 경로 주입 방지
const SYMBOL_PATTERN = /^[A-Z0-9]{5,20}$/;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();

  if (!SYMBOL_PATTERN.test(symbol)) {
    return NextResponse.json({ error: '심볼 형식이 올바르지 않습니다.' }, { status: 400 });
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

  try {
    const url = `${base}/fapi/v1/premiumIndex?symbol=${symbol}`;
    const res = await fetch(url, { cache: 'no-store' });

    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json(
        { error: `테스트넷 마크 가격 조회 실패 (${res.status})`, detail: body.slice(0, 200) },
        { status: 502 },
      );
    }

    const data = (await res.json()) as PremiumIndex;
    const markPrice = Number.parseFloat(data.markPrice);

    // 심볼이 없으면 바이낸스가 배열을 주거나 markPrice가 비어 온다 → 숫자가 아니면 막는다
    if (!Number.isFinite(markPrice)) {
      return NextResponse.json({ error: '마크 가격을 해석할 수 없습니다.' }, { status: 502 });
    }

    return NextResponse.json({ markPrice, symbol: data.symbol });
  } catch (err) {
    return NextResponse.json(
      { error: '테스트넷에 연결할 수 없습니다.', detail: err instanceof Error ? err.message : '' },
      { status: 502 },
    );
  }
}
