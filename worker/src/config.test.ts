import { describe, expect, it } from 'vitest';
import { __testing } from './config.ts';

const { assertTestnetUrl, ALLOWED_REST_HOSTS, ALLOWED_WS_HOSTS } = __testing;

/**
 * 이 테스트가 지키는 것: CLAUDE.md 가드레일 1 (메인넷 연동 금지).
 * 설정이 메인넷을 향하면 주문이 나가기 전에 기동이 실패해야 한다.
 */
describe('assertTestnetUrl — 메인넷 차단', () => {
  it('메인넷 REST 호스트를 거부한다', () => {
    expect(() => assertTestnetUrl('https://fapi.binance.com', ALLOWED_REST_HOSTS, 'REST')).toThrow(
      /테스트넷이 아닙니다/,
    );
  });

  it('메인넷 WS 호스트를 거부한다', () => {
    expect(() => assertTestnetUrl('wss://fstream.binance.com/ws', ALLOWED_WS_HOSTS, 'WS')).toThrow(
      /테스트넷이 아닙니다/,
    );
  });

  it('메인넷 스팟 호스트도 거부한다', () => {
    expect(() => assertTestnetUrl('https://api.binance.com', ALLOWED_REST_HOSTS, 'REST')).toThrow();
  });

  it('테스트넷처럼 보이는 유사 도메인을 거부한다', () => {
    // 부분 문자열 매칭이 아니라 hostname 완전 일치여야 한다
    expect(() =>
      assertTestnetUrl('https://demo-fapi.binance.com.evil.io', ALLOWED_REST_HOSTS, 'REST'),
    ).toThrow();
    expect(() =>
      assertTestnetUrl('https://notdemo-fapi.binance.com', ALLOWED_REST_HOSTS, 'REST'),
    ).toThrow();
  });

  it('허용된 테스트넷 호스트는 통과한다', () => {
    expect(assertTestnetUrl('https://demo-fapi.binance.com', ALLOWED_REST_HOSTS, 'REST')).toBe(
      'https://demo-fapi.binance.com',
    );
    expect(assertTestnetUrl('https://testnet.binancefuture.com', ALLOWED_REST_HOSTS, 'REST')).toBe(
      'https://testnet.binancefuture.com',
    );
    expect(assertTestnetUrl('wss://demo-fstream.binance.com', ALLOWED_WS_HOSTS, 'WS')).toBe(
      'wss://demo-fstream.binance.com',
    );
  });

  it('뒤 슬래시를 정리한다', () => {
    expect(assertTestnetUrl('https://demo-fapi.binance.com/', ALLOWED_REST_HOSTS, 'REST')).toBe(
      'https://demo-fapi.binance.com',
    );
  });

  it('해석 불가한 주소는 throw', () => {
    expect(() => assertTestnetUrl('not-a-url', ALLOWED_REST_HOSTS, 'REST')).toThrow(/해석할 수 없/);
  });
});
