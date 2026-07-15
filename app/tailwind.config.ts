import type { Config } from 'tailwindcss';

// 디자인 톤: Stripe / Linear / Vercel — 여백 넉넉히, 절제된 색, 명확한 위계 (CLAUDE.md).
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 손익 표시용. 한국 관습(상승=빨강)이 아니라 국제 관습(상승=초록)을 따른다.
        profit: '#059669',
        loss: '#dc2626',
      },
    },
  },
  plugins: [],
};

export default config;
