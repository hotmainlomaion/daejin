import 'server-only';

import { createClient } from '@supabase/supabase-js';

/**
 * service_role 클라이언트 (RLS 우회).
 *
 * ⚠️ CLAUDE.md 보안 가드레일 7: 이 모듈은 서버 전용이다.
 * 파일 맨 위의 `import 'server-only'`가 클라이언트 컴포넌트에서 import될 경우
 * **빌드를 실패시킨다** — 실수로 클라이언트 번들에 유입되는 것을 컴파일 타임에 막는다.
 *
 * 쓰는 곳: 유저 테스트넷 키를 암호화해서 저장할 때. exchange_keys는 authenticated에
 * insert 권한이 없으므로(마이그레이션 참조) 이 클라이언트로만 기록된다.
 */
export function createSupabaseAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.');
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
