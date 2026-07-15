import { NextResponse } from 'next/server';
import { resolveRestBase, type Candle } from '@futureslab/shared';

/**
 * 캔들 시세 프록시 (공개 데이터 — 키 불필요).
 *
 * 브라우저가 바이낸스를 직접 부르지 않고 서버를 거치는 이유:
 *  1. CORS를 신경 쓰지 않아도 된다
 *  2. 테스트넷 호스트 강제(가드레일 1)가 서버에서 한 번 더 걸린다 —
 *     클라이언트 코드가 어떤 URL을 넣든 메인넷으로 못 나간다
 */
export const dynamic = 'force-dynamic';

/** 바이낸스 REST kline 응답: 배열의 배열 */
type RawKline = [number, string, string, string, string, string, number, ...unknown[]];

const ALLOWED_INTERVALS = new Set(['1m', '5m', '15m', '1h', '4h', '1d']);
// 심볼은 화이트리스트가 아니라 형식으로 막는다 (BTCUSDT 류만 허용) — 경로 주입 방지
const SYMBOL_PATTERN = /^[A-Z0-9]{5,20}$/;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();
  const interval = searchParams.get('interval') ?? '15m';
  const limit = Math.min(Number(searchParams.get('limit') ?? 200), 500);

  if (!SYMBOL_PATTERN.test(symbol)) {
    return NextResponse.json({ error: '심볼 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  if (!ALLOWED_INTERVALS.has(interval)) {
    return NextResponse.json({ error: '지원하지 않는 캔들 주기입니다.' }, { status: 400 });
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
    const url = `${base}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url, { cache: 'no-store' });

    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json(
        { error: `테스트넷 시세 조회 실패 (${res.status})`, detail: body.slice(0, 200) },
        { status: 502 },
      );
    }

    const raw = (await res.json()) as RawKline[];
    const candles: Candle[] = raw.map((k) => ({
      openTime: k[0],
      open: Number.parseFloat(k[1]),
      high: Number.parseFloat(k[2]),
      low: Number.parseFloat(k[3]),
      close: Number.parseFloat(k[4]),
      volume: Number.parseFloat(k[5]),
      closeTime: k[6],
    }));

    return NextResponse.json({ candles });
  } catch (err) {
    return NextResponse.json(
      { error: '테스트넷에 연결할 수 없습니다.', detail: err instanceof Error ? err.message : '' },
      { status: 502 },
    );
  }
}
