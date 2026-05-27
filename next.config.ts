import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {},
  // 배포마다 정적 에셋 URL에 ?dpl=<sha>를 붙여 캐시 버스팅 (재방문자 stale 청크 방지)
  deploymentId: process.env.VERCEL_GIT_COMMIT_SHA,
};

export default nextConfig;
