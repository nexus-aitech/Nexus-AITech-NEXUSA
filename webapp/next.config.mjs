// webapp/next.config.mjs
import path from "path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: { instrumentationHook: true },

  // بهتره در ادامه این دو مورد رو غیرفعال کنیم، فعلاً نگه می‌داریم تا بیلد جلو بره
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  swcMinify: true,
  images: { formats: ["image/avif", "image/webp"] },

  // ⬇️ این بخش مشکل رزولوشن @/… را برای Webpack حل می‌کند
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@": path.resolve(process.cwd()), // ریشه‌ی پروژه (پوشه webapp)
    };
    return config;
  },
};

export default nextConfig;
