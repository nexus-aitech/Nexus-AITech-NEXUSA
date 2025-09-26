import { withSentryConfig } from "@sentry/nextjs"
import path, { dirname } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const isProd = process.env.NODE_ENV === "production"

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",

  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  outputFileTracingRoot: __dirname,

  images: { formats: ["image/avif", "image/webp"] },

  productionBrowserSourceMaps: true,

  compiler: {
    removeConsole: isProd ? { exclude: ["error", "warn"] } : false,
  },

  // 🚀 Turbopack تنظیم جدید
  turbopack: {
    root: __dirname,
  },

  async headers() {
    const ContentSecurityPolicy = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: http://localhost:8000 http://127.0.0.1:8000",
      "media-src 'self' blob: data:",
      "frame-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "accelerometer=(), camera=(), geolocation=(), microphone=()" },
          ...(isProd ? [{ key: "Content-Security-Policy", value: ContentSecurityPolicy }] : []),
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/icons/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ]
  },

  async redirects() {
    return [
      { source: "/signup", destination: "/auth/signup", permanent: false },
      { source: "/signin", destination: "/auth/signin", permanent: false },
      { source: "/solutions/hedge-funds", destination: "/docs#hedge-funds", permanent: false },
      { source: "/solutions/prop", destination: "/docs#prop", permanent: false },
      { source: "/solutions/education", destination: "/docs#education", permanent: false },
    ]
  },

  webpack: (config, { isServer, webpack }) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@": path.resolve(__dirname, "src"),
    }

    if (!isServer) {
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false,
        net: false,
        tls: false,
        child_process: false,
      }
    }

    config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^\.\/locale$/, contextRegExp: /moment$/ }))

    return config
  },
}

const sentryOptions = {
  org: "nexus-aitech",
  project: "javascript-nextjs",
  silent: !process.env.CI,
  tunnelRoute: "/monitoring",
  disableLogger: true,
  automaticVercelMonitors: true,
}

export default withSentryConfig(nextConfig, sentryOptions)
