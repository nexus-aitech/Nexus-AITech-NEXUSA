// ==============================================
// File: webapp/src/app/page.tsx
// Home page (RSC) with world-class UX, SEO, perf, and global Feedback
// ==============================================

import type { Metadata } from "next";
import Link from "next/link";
import dynamic from "next/dynamic";
import Header from "@/components/layout/Header";
import Hero from "@/components/layout/Hero";
import { Primary, Ghost } from "@/components/ui/Button";
import { Stat } from "@/components/ui/Stat";

// --- Lazy sections with skeleton fallbacks (perf) ---
const CoreCapabilities = dynamic(
  () => import("@/components/sections/CoreCapabilities"),
  { loading: () => <SectionSkeleton title="قابلیت‌های هسته" /> }
);

const Feedback = dynamic(
  () => import("@/components/sections/Feedback"),
  { loading: () => <SectionSkeleton title="بازخورد کاربران" /> }
);

// Revalidation: keep current behavior (no ISR) until product decisions change.
export const revalidate = 0;
// If you plan to deploy mostly at edge, uncomment below (requires compliant code):
// export const runtime = "edge";

// --------- Metadata (SEO / SMO) ----------
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://www.nexus-aitech.net";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Nexus-AITech — پلتفرم سیگنال، بک‌تست و گزارش‌گیری",
  description:
    "تحلیل جریان دادهٔ صرافی‌ها، مهندسی ویژگی، موتور سیگنال، بک‌تست دقیق و گزارش‌گیری LLM — همه در یک سکوی ماژولار سطح‌جهانی.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    title: "Nexus-AITech — Signal, Backtest & LLM Reporting",
    description:
      "سکوی ماژولار برای داده‌های کریپتو، سیگنال، بک‌تست و گزارش‌گیری هوشمند.",
    siteName: "Nexus-AITech",
    images: [
      {
        url: "/og/Nexus-AITech-og.png",
        width: 1200,
        height: 630,
        alt: "Nexus-AITech — پلتفرم ماژولار",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nexus-AITech — Signal, Backtest & LLM Reporting",
    description:
      "سکوی ماژولار برای داده‌های کریپتو، سیگنال، بک‌تست و گزارش‌گیری هوشمند.",
    images: ["/og/Nexus-AITech-og.png"],
  },
};

// --------- Helpers ----------
function Container({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">{children}</div>;
}

function SectionSkeleton({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between">
        <div className="h-4 w-40 rounded bg-white/10" aria-hidden />
        <div className="h-4 w-16 rounded bg-white/5" aria-hidden />
      </div>
      <div className="mt-4 h-5 w-56 rounded bg-white/10" aria-hidden />
      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="h-20 rounded-xl bg-white/5" aria-label={`${title} loading`} />
        <div className="h-20 rounded-xl bg-white/5" aria-hidden />
        <div className="h-20 rounded-xl bg-white/5" aria-hidden />
      </div>
    </div>
  );
}

// Lightweight CTA tracking without external deps.
// Replace with your analytics SDK if available.
function track(event: string, payload?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    (window as any).dataLayer = (window as any).dataLayer || [];
    (window as any).dataLayer.push({ event, ...payload });
  } catch {}
}

// JSON-LD for rich results
function JsonLd() {
  const json = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Nexus-AITech",
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    url: SITE_URL + "/",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "48-hour free trial",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.9",
      reviewCount: "137",
    },
    featureList: [
      "Signal Engine",
      "Backtesting",
      "LLM Reporting",
      "Exchange Integrations",
      "Realtime Data",
    ],
  };
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}

export default function HomePage() {
  return (
    <div dir="rtl" className="selection:bg-emerald-400/20 selection:text-emerald-100">
      <JsonLd />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Header />
        <Hero />
      </div>

      <Container>
        {/* --- Intro / KPIs --- */}
        <section id="intro" className="pt-6" aria-labelledby="section-intro">
          <h1 id="section-intro" className="sr-only">
            معرفی Nexus-AITech و شاخص‌های کلیدی
          </h1>

          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <div
                className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-[11px] text-white/70"
                aria-label="وضعیت: آمادهٔ لانچ عمومی"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                آمادهٔ لانچ عمومی
              </div>

              <h2 className="mt-4 text-4xl md:text-5xl font-black tracking-tight text-white">
                Nexus-AITech
                <span className="text-white/60 font-medium">
                  {" "}
                  – پلتفرم سیگنال، بک‌تست و گزارش‌گیری
                </span>
              </h2>

              <p className="mt-4 text-white/70 leading-7">
                تحلیل جریان دادهٔ صرافی‌ها، مهندسی ویژگی، موتور سیگنال، بک‌تست و گزارش‌گیری LLM—همه در یک سکوی ماژولار.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/pricing"
                  aria-label="شروع تست رایگان ۴۸ ساعته"
                  onClick={() => track("cta_click", { cta: "free_trial" })}
                >
                  <Primary>شروع تست رایگان ۴۸ ساعته</Primary>
                </Link>
                <Link
                  href="/about"
                  aria-label="مشاهدهٔ راهنما"
                  onClick={() => track("cta_click", { cta: "docs" })}
                >
                  <Ghost>راهنما</Ghost>
                </Link>
              </div>

              <div className="mt-8 grid grid-cols-3 gap-3" role="list" aria-label="شاخص‌های کلیدی">
                <Stat value="6+" label="اکوسیستم صرافی" />
                <Stat value="≤100ms" label="پاسخ‌دهی API" />
                <Stat value=">99.9%" label="آپ‌تایم هدف" />
              </div>
            </div>

            <div
              className="rounded-3xl border border-white/10 bg-white/5 p-4"
              aria-label="پیش‌نمایش سلامت سیستم"
            >
              <div className="rounded-2xl h-64 md:h-80 w-full bg-gradient-to-br from-white/10 to-transparent flex items-center justify-center">
                <div className="text-center">
                  <div className="text-xs text-white/60">نمایی از API سلامت</div>
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/50 p-3 font-mono text-white/90 text-xs">
                    GET /health → <span className="text-emerald-400">200 OK</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Core Capabilities */}
        <section id="capabilities" className="mt-10" aria-labelledby="section-capabilities">
          <h2 id="section-capabilities" className="text-2xl font-bold text-white">
            قابلیت‌های هسته
          </h2>
          <div className="mt-3">
            <CoreCapabilities />
          </div>
        </section>

        {/* Integrations */}
        <section id="integrations" className="space-y-3 mt-10" aria-labelledby="section-integrations">
          <h2 id="section-integrations" className="text-2xl font-bold text-white">
            یکپارچه‌شده با
          </h2>
          <div
            className="grid grid-cols-2 sm:grid-cols-4 gap-3 opacity-80"
            role="list"
            aria-label="لیست صرافی‌های پشتیبانی‌شده"
          >
            {["Binance", "OKX", "Bybit", "KuCoin", "CoinEx", "Bitget"].map((ex) => (
              <div
                key={ex}
                role="listitem"
                className="rounded-xl border border-white/10 p-4 text-center"
              >
                {ex}
              </div>
            ))}
          </div>
        </section>

        {/* Global Feedback */}
        <section id="feedback" className="mt-12" aria-labelledby="section-feedback">
          <h2 id="section-feedback" className="text-2xl font-bold text-white sr-only">
            بازخورد کاربران
          </h2>
          {/* Use your API route /feedback; component stays isolated as client if needed */}
          <Feedback endpoint="/feedback" />
        </section>
      </Container>
    </div>
  );
}
