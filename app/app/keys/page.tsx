import { KeyForm } from '@/components/KeyForm';
import { TestnetNotice } from '@/components/TestnetNotice';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

/**
 * 테스트넷 키 등록 (PRD F2).
 *
 * PRD §7: 이 화면이 **최대 이탈 구간**이다. 발급 과정을 스텝별로 명시해서 허들을 낮춘다.
 * 입력한 키는 서버에서 암호화된 뒤 저장되며 다시 화면에 표시되지 않는다.
 */
export default async function KeysPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <main className="max-w-2xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">테스트넷 API 키 등록</h1>
        <p className="text-sm leading-relaxed text-neutral-600">
          봇이 주문을 넣으려면 바이낸스 테스트넷 키가 필요합니다. 테스트넷 키는 실제 자금에 접근할 수
          없습니다.
        </p>
      </header>

      <TestnetNotice />

      <section className="space-y-3 rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-900">키 발급 방법</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-neutral-600">
          <li>
            <a
              href="https://testnet.binancefuture.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-900 underline underline-offset-2"
            >
              testnet.binancefuture.com
            </a>
            에 접속해 GitHub 계정으로 로그인합니다.
          </li>
          <li>가입 시 테스트용 USDT가 자동 지급됩니다. 실제 입금은 필요 없습니다.</li>
          <li>하단의 <strong>API Key</strong> 탭에서 키를 생성합니다.</li>
          <li>
            <strong>API Key</strong>와 <strong>Secret Key</strong>를 복사해 아래에 붙여넣습니다.
            Secret은 발급 시 한 번만 보이므로 창을 닫기 전에 복사하세요.
          </li>
        </ol>
      </section>

      <KeyForm />
    </main>
  );
}
