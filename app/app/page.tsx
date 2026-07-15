import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TestnetNotice } from '@/components/TestnetNotice';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect('/dashboard');

  return (
    <main className="space-y-10">
      <header className="space-y-4">
        <p className="text-sm font-medium text-neutral-500">FuturesLab</p>
        {/* 카피 원칙: "검증·시뮬레이션·테스트"로만 서술한다 (가드레일 3). */}
        <h1 className="text-4xl font-semibold tracking-tight text-neutral-900">
          선물 봇 전략을,
          <br />
          자금 리스크 없이 검증합니다.
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-neutral-600">
          코딩 없이 전략을 설정하고 바이낸스 테스트넷에서 실시간으로 돌려봅니다. 청산과 펀딩비까지
          실전형으로 시뮬레이션되며, 실제 자금은 사용하지 않습니다.
        </p>
      </header>

      <TestnetNotice />

      <Link
        href="/login"
        className="inline-flex rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700"
      >
        시작하기
      </Link>
    </main>
  );
}
