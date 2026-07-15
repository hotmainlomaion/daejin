import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FuturesLab — 선물 전략 검증 시뮬레이터',
  // 규제 가드레일 3·4: 수익·보장 표현 없이 "교육·검증" 성격만 서술한다.
  description:
    '바이낸스 테스트넷에서 선물 자동매매 전략을 코딩 없이 검증하는 교육용 시뮬레이터입니다. 실제 자금을 사용하지 않습니다.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      {/* 터미널 화면이 전체 높이를 쓰므로 여기서 폭을 제한하지 않는다.
          각 페이지가 자기 컨테이너를 책임진다. */}
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
