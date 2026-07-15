/**
 * 최소 로거.
 *
 * ⚠️ CLAUDE.md 보안 가드레일 8: 시크릿을 로그에 찍지 않는다.
 * API 키·시크릿·서명·service_role 키를 이 함수에 넘기지 말 것.
 * 키를 식별해야 하면 `maskKey()`를 거친 값만 쓴다.
 */
type Level = 'info' | 'warn' | 'error';

function emit(level: Level, message: string): void {
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  info: (message: string) => emit('info', message),
  warn: (message: string) => emit('warn', message),
  error: (message: string, err?: unknown) => {
    const detail = err instanceof Error ? `: ${err.message}` : err !== undefined ? `: ${String(err)}` : '';
    emit('error', `${message}${detail}`);
  },
};
