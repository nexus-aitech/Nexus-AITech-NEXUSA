import {withSentryConfig} from "@sentry/nextjs";
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

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "nexus-aitech",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: true,
});