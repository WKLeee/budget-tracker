import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {},
  // 배포마다 정적 에셋 URL에 ?dpl=<sha>를 붙여 캐시 버스팅 (재방문자 stale 청크 방지)
  // VERCEL_GIT_COMMIT_SHA는 40자라 Next의 32자 제한에 맞춰 앞 16자만 사용
  deploymentId: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 16),
};

export default nextConfig;
