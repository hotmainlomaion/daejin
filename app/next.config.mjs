/** @type {import('next').NextConfig} */
const nextConfig = {
  // 워크스페이스의 @futureslab/shared를 TS 소스 그대로 가져다 쓴다.
  transpilePackages: ['@futureslab/shared'],
};

export default nextConfig;
