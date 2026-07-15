import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, maskKey, parseEncryptionKey } from './crypto.ts';

// 테스트 전용 키 (실제 시크릿 아님)
const HEX_KEY = 'a'.repeat(64);
const OTHER_KEY = 'b'.repeat(64);

describe('parseEncryptionKey', () => {
  it('hex 64자를 받는다', () => {
    expect(parseEncryptionKey(HEX_KEY)).toHaveLength(32);
  });

  it('base64도 받는다', () => {
    const b64 = Buffer.alloc(32, 7).toString('base64');
    expect(parseEncryptionKey(b64)).toHaveLength(32);
  });

  it('빈 값이면 throw', () => {
    expect(() => parseEncryptionKey('')).toThrow(/ENCRYPTION_KEY/);
  });

  it('길이가 32바이트가 아니면 throw', () => {
    expect(() => parseEncryptionKey('abcd')).toThrow(/32바이트/);
  });
});

describe('encryptSecret / decryptSecret', () => {
  it('왕복하면 원문이 그대로 나온다', () => {
    const plain = 'test-api-secret-1234567890';
    expect(decryptSecret(encryptSecret(plain, HEX_KEY), HEX_KEY)).toBe(plain);
  });

  it('암호문에 평문이 남지 않는다', () => {
    const plain = 'super-secret-value';
    expect(encryptSecret(plain, HEX_KEY)).not.toContain(plain);
  });

  it('같은 평문도 매번 다른 암호문이 된다 (IV 랜덤)', () => {
    const plain = 'same-input';
    expect(encryptSecret(plain, HEX_KEY)).not.toBe(encryptSecret(plain, HEX_KEY));
  });

  it('다른 키로 복호화하면 throw (조용히 쓰레기값을 내지 않는다)', () => {
    const encrypted = encryptSecret('secret', HEX_KEY);
    expect(() => decryptSecret(encrypted, OTHER_KEY)).toThrow();
  });

  it('변조된 암호문은 인증에 실패한다', () => {
    const encrypted = encryptSecret('secret', HEX_KEY);
    const body = Buffer.from(encrypted.slice(3), 'base64');
    const lastIndex = body.length - 1;
    body.writeUInt8(body.readUInt8(lastIndex) ^ 0xff, lastIndex); // 마지막 바이트 뒤집기
    const tampered = `v1:${body.toString('base64')}`;
    expect(() => decryptSecret(tampered, HEX_KEY)).toThrow();
  });

  it('형식이 어긋나면 throw', () => {
    expect(() => decryptSecret('no-separator', HEX_KEY)).toThrow(/형식/);
    expect(() => decryptSecret('v2:abcd', HEX_KEY)).toThrow(/버전/);
    expect(() => decryptSecret('v1:AAAA', HEX_KEY)).toThrow(/길이/);
  });

  it('유니코드도 왕복한다', () => {
    const plain = '키-값-한글';
    expect(decryptSecret(encryptSecret(plain, HEX_KEY), HEX_KEY)).toBe(plain);
  });
});

describe('maskKey', () => {
  it('앞뒤 4자만 남긴다', () => {
    expect(maskKey('abcdefghijklmnop')).toBe('abcd…mnop');
  });

  it('짧은 값은 통째로 가린다', () => {
    expect(maskKey('abc')).toBe('****');
  });
});
