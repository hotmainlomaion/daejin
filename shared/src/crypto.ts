/**
 * 유저 테스트넷 키 암호화 (CLAUDE.md 보안 가드레일 5).
 *
 * ⚠️ 서버 전용 모듈이다. `@futureslab/shared/crypto` 서브패스로만 노출하며,
 *    클라이언트 컴포넌트에서 import하지 않는다 (node:crypto가 번들에 들어간다).
 *
 * 형식: `v1:<base64(iv | authTag | ciphertext)>`
 *   - iv      12바이트 (GCM 권장)
 *   - authTag 16바이트
 *   - 나머지  ciphertext
 * 버전 접두사를 둬서 나중에 알고리즘을 바꿔도 기존 값을 읽을 수 있게 한다.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const PREFIX = 'v1';

/**
 * ENCRYPTION_KEY 문자열을 32바이트 키로 해석한다. hex(64자) 또는 base64를 받는다.
 * 형식이 어긋나면 조용히 넘어가지 않고 즉시 throw — 잘못된 키로 암호화하면
 * 나중에 복호화가 통째로 막힌다.
 */
export function parseEncryptionKey(raw: string): Buffer {
  if (!raw) {
    throw new Error('ENCRYPTION_KEY가 비어 있습니다. `openssl rand -hex 32`로 생성하세요.');
  }

  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    key = Buffer.from(raw, 'base64');
  }

  if (key.length !== KEY_BYTES) {
    throw new Error(
      `ENCRYPTION_KEY는 32바이트여야 합니다 (현재 ${key.length}바이트). ` +
        '`openssl rand -hex 32`로 생성하세요.',
    );
  }
  return key;
}

/** 평문을 암호화한다. 같은 평문이라도 매번 다른 IV를 써서 결과가 달라진다. */
export function encryptSecret(plaintext: string, rawKey: string): string {
  const key = parseEncryptionKey(rawKey);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${Buffer.concat([iv, tag, ciphertext]).toString('base64')}`;
}

/**
 * 암호문을 복호화한다.
 * 변조되었거나 키가 다르면 GCM 인증에 실패해 throw한다.
 */
export function decryptSecret(payload: string, rawKey: string): string {
  const key = parseEncryptionKey(rawKey);

  const separator = payload.indexOf(':');
  if (separator === -1) {
    throw new Error('암호문 형식이 올바르지 않습니다.');
  }

  const version = payload.slice(0, separator);
  if (version !== PREFIX) {
    throw new Error(`지원하지 않는 암호문 버전입니다: ${version}`);
  }

  const buf = Buffer.from(payload.slice(separator + 1), 'base64');
  if (buf.length <= IV_BYTES + TAG_BYTES) {
    throw new Error('암호문 길이가 올바르지 않습니다.');
  }

  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** 로그·UI에 키를 노출하지 않으면서 식별만 하기 위한 마스킹 (가드레일 8). */
export function maskKey(apiKey: string): string {
  if (apiKey.length <= 8) return '****';
  return `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`;
}
