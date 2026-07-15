'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * 브라우저용 Supabase 클라이언트.
 * anon 키만 쓴다 — 여기에 service_role이나 ENCRYPTION_KEY가 들어오면 안 된다.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
