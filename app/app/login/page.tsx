'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/** 로그인/가입 (PRD F1). MVP는 이메일+비밀번호만. */
export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message);
      setPending(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-sm space-y-8 pt-16">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {mode === 'signin' ? '로그인' : '가입하기'}
        </h1>
        <p className="text-sm text-muted">테스트넷 전용 검증 시뮬레이터입니다.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-sm text-muted">
            이메일
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-sm text-muted">
            비밀번호
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>

        {error && <p className="text-sm text-short">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-brand px-4 py-2.5 text-sm font-semibold text-canvas transition hover:brightness-110 disabled:opacity-40"
        >
          {pending ? '처리 중…' : mode === 'signin' ? '로그인' : '가입하기'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
        className="text-sm text-muted underline underline-offset-4 hover:text-ink"
      >
        {mode === 'signin' ? '계정이 없으신가요? 가입하기' : '이미 계정이 있으신가요? 로그인'}
      </button>
    </main>
  );
}
