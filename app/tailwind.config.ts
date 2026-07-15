import type { Config } from 'tailwindcss';

/**
 * 디자인 톤: 다크 트레이딩 터미널 (CLAUDE.md §디자인 톤).
 * KuCoin Futures Lite가 기준 레퍼런스 — 다크 배경, 차트 중심, 익숙한 거래소 레이아웃.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 배경 위계: canvas(가장 어두움) → panel → elevated
        canvas: '#0b0e11',
        panel: '#14171c',
        elevated: '#1c2027',
        line: '#2a2f3a',
        // 텍스트
        ink: '#eaecef',
        muted: '#848e9c',
        faint: '#5e6673',
        // 롱/숏 — 국제 관습(상승=초록). 한국 관습(상승=빨강)이 아니다.
        long: '#26a69a',
        short: '#ef5350',
        brand: '#24ae8f',
      },
      fontFamily: {
        // 가격·수량이 흔들리지 않도록 등폭
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
