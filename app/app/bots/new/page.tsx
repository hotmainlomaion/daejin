import { redirect } from 'next/navigation';
import { BotForm } from '@/components/BotForm';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function NewBotPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // 암호문은 컬럼 권한으로 막혀 있어 label만 읽힌다 (마이그레이션 참조).
  const { data: keys } = await supabase
    .from('exchange_keys')
    .select('id, label')
    .order('created_at', { ascending: false });

  // 키가 없으면 봇을 만들 수 없다 — 발급 안내로 보낸다.
  if (!keys || keys.length === 0) redirect('/keys');

  return (
    <main className="mx-auto max-w-md space-y-8 px-6 py-16">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">봇 만들기</h1>
        <p className="text-sm text-muted">
          이평선 교차 전략의 파라미터를 설정합니다. 값은 언제든 바꿔서 다시 검증할 수 있습니다.
        </p>
      </header>

      <BotForm keys={keys} />
    </main>
  );
}
