// app/layout.tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";
import React from "react";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

// ---------- Site constants ----------
const siteName = "NEXUSA";
const description = "AI Signals, Backtesting & Reports";
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://www.nexus-aitech.net";

// ---------- Metadata / SEO ----------
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${siteName} – پلتفرم سیگنال، بک‌تست و گزارش‌گیری`,
    template: `%s | ${siteName}`,
  },
  description,
  applicationName: siteName,
  keywords: ["NEXUSA", "سیگنال", "بک‌تست", "LLM", "تحلیل صرافی", "کوانت"],
  manifest: "/site.webmanifest",
  robots: { index: true, follow: true },
  alternates: { canonical: siteUrl },
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon", sizes: "16x16 32x32 48x48" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    title: `${siteName} – پلتفرم سیگنال، بک‌تست و گزارش‌گیری`,
    description,
    siteName,
    images: [
      {
        url: "/og-cover.png", // توصیه: این تصویر را در public بگذار (1200x630)
        width: 1200,
        height: 630,
        alt: `${siteName} Open Graph`,
      },
    ],
    locale: "fa_IR",
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteName} – پلتفرم سیگنال، بک‌تست و گزارش‌گیری`,
    description,
    images: ["/og-cover.png"],
  },
};

// ---------- Viewport ----------
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,       // دسترسی‌پذیری: اجازه‌ی زوم
  viewportFit: "cover",  // رعایت safe-area در iOS
  themeColor: "#0B0F13",
};

// ---------- JSON-LD ----------
const orgJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Nexus-AITech",
  url: siteUrl,
  logo: `${siteUrl}/icon-512.png`,
};

const webSiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: siteName,
  url: siteUrl,
  potentialAction: {
    "@type": "SearchAction",
    target: `${siteUrl}/search?q={query}`,
    "query-input": "required name=query",
  },
};

// ---------- Root Layout ----------
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body className="min-h-screen antialiased bg-[#0B0F13] text-white">
        {children}
        <Analytics />
        <SpeedInsights />

        {/* JSON-LD */}
        <Script
          id="ld-org"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
        <Script
          id="ld-website"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteJsonLd) }}
        />
      </body>
    </html>
  );
}
