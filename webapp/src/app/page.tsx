<<<<<<< HEAD
'use client'

import React, { Suspense, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { motion } from 'framer-motion'
import Header from '@/components/layout/Header'
import Hero from '@/components/layout/Hero'
import DataOverview from '@/components/widgets/DataOverview'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowRight, ShieldCheck, Zap, Sparkles } from 'lucide-react'

// ===== Lazy imports for heavy sections and widgets
const LiveOhlcvTicker = dynamic(() => import('@/components/LiveOhlcvTicker'), { ssr: false })
const CoreCapabilities = dynamic(() => import('@/components/sections/CoreCapabilities'), { ssr: false })
const Feedback = dynamic(() => import('@/components/sections/Feedback'), { ssr: false })

// ===== React‑Three‑Fiber (WebGL). We guard for SSR and reduced motion.
const Canvas = dynamic(() => import('@react-three/fiber').then(m => m.Canvas), { ssr: false }) as any
const useFrame = dynamic(() => import('@react-three/fiber').then(m => m.useFrame), { ssr: false }) as any
const Drei = {
  OrbitControls: dynamic(() => import('@react-three/drei').then(m => m.OrbitControls), { ssr: false }) as any,
  Environment: dynamic(() => import('@react-three/drei').then(m => m.Environment), { ssr: false }) as any,
  Html: dynamic(() => import('@react-three/drei').then(m => m.Html), { ssr: false }) as any,
  Float: dynamic(() => import('@react-three/drei').then(m => m.Float), { ssr: false }) as any,
  MeshDistortMaterial: dynamic(() => import('@react-three/drei').then(m => (m as any).MeshDistortMaterial), { ssr: false }) as any,
}

// ===== 3D brand sphere (merged + refined)
function BrandSphere({ brandText = 'NEXUSA' }: { brandText?: string }) {
  const [rot, setRot] = useState(0)
  useFrame?.((_, delta: number) => setRot((r: number) => (r + delta * 0.25) % (Math.PI * 2)))

  return (
    <group rotation={[0.2, rot, 0]}>
      <mesh castShadow receiveShadow>
        <icosahedronGeometry args={[1.6, 6]} />
        {/* @ts-ignore three/drei dynamic */}
        <Drei.MeshDistortMaterial
          color="#5b8ef7"
          emissive="#2848a5"
          emissiveIntensity={0.3}
          roughness={0.2}
          metalness={0.4}
          distort={0.3}
          speed={1.2}
        />
      </mesh>
      {/* soft halo */}
      <mesh>
        <sphereGeometry args={[1.72, 64, 64]} />
        <meshBasicMaterial color="#7aa0ff" transparent opacity={0.08} />
      </mesh>
      {/* floating label */}
      {/* @ts-ignore three/drei dynamic */}
      <Drei.Float speed={1.5} rotationIntensity={0.2} floatIntensity={1.5}>
        {/* @ts-ignore */}
        <Drei.Html center distanceFactor={6} transform>
          <div className="select-none pointer-events-none text-center">
            <div className="text-3xl md:text-4xl font-extrabold tracking-widest bg-gradient-to-r from-blue-200 to-indigo-200 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(90,135,255,0.35)]">
              {brandText}
            </div>
          </div>
        </Drei.Html>
      </Drei.Float>
      {/* lights */}
      <pointLight position={[3, 2, 2]} intensity={1.3} color="#7eaaff" />
      <pointLight position={[-2, -1, -1]} intensity={0.6} color="#4455ff" />
      <ambientLight intensity={0.35} />
    </group>
  )
}

export default function Page() {
  // ===== Motion/GL capability guards
  const [canRender3D, setCanRender3D] = useState(false)
  const prefersReduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  )

  useEffect(() => {
    if (prefersReduced) return setCanRender3D(false)
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      setCanRender3D(!!gl)
    } catch {
      setCanRender3D(false)
    }
  }, [prefersReduced])

  return (
    <div className="relative min-h-[calc(100dvh)] selection:bg-emerald-400/20 selection:text-emerald-100">
      {/* ===== Animated BG layer */}
      <div className="absolute inset-0 -z-10">
        {canRender3D ? (
          <Suspense fallback={<div className="w-full h-full bg-[#0b1220]" />}> 
            {/* @ts-ignore */}
            <Canvas dpr={[1, 1.8]} camera={{ position: [0, 0, 4.2], fov: 45 }} shadows gl={{ antialias: true }}>
              <color attach="background" args={["#0b1220"]} />
              {/* @ts-ignore */}
              <Drei.Environment preset="city" />
              <BrandSphere />
              {/* @ts-ignore */}
              <Drei.OrbitControls enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={0.6} />
            </Canvas>
          </Suspense>
        ) : (
          <div className="w-full h-full bg-[radial-gradient(circle_at_center,rgba(49,84,212,0.35),transparent_70%),#0b1220]" />
        )}
      </div>

      {/* ===== Header + Hero */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-2">
=======
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
>>>>>>> 91b0962d71cf10e61b94692da758db74b7b57016
        <Header />
        <Hero />
      </div>

<<<<<<< HEAD
      {/* ===== Primary CTAs & feature highlights (merged from both files) */}
      <section className="relative z-10 container-responsive pt-6">
        <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.35 }}>
          <Badge variant="secondary" className="mb-3">AI-first • Web3-native • Real-time</Badge>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild><Link href="/signup"><span className="flex items-center">Get started <ArrowRight className="ml-1 h-4 w-4" /></span></Link></Button>
            <Button asChild variant="secondary"><Link href="/pricing"><span>See pricing</span></Link></Button>
            <Button asChild variant="secondary"><Link href="/data-signals"><span>Live data</span></Link></Button>
=======
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
>>>>>>> 91b0962d71cf10e61b94692da758db74b7b57016
          </div>

<<<<<<< HEAD
          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {[
              { icon: <ShieldCheck className="h-4 w-4" />, title: 'Security first', text: 'TLS everywhere, OAuth, role-based access' },
              { icon: <Zap className="h-4 w-4" />, title: 'Low-latency', text: 'Sub-100ms streaming & optimized pipelines' },
              { icon: <Sparkles className="h-4 w-4" />, title: 'Developer-friendly', text: 'SDKs, webhooks, and great docs' },
            ].map((f, i) => (
              <Card key={i} className="glass"><CardContent className="p-4"><div className="flex items-center gap-2 text-sm font-medium">{f.icon}<span>{f.title}</span></div><p className="mt-1 text-xs text-white/70">{f.text}</p></CardContent></Card>
            ))}
=======
        {/* Core Capabilities */}
        <section id="capabilities" className="mt-10" aria-labelledby="section-capabilities">
          <h2 id="section-capabilities" className="text-2xl font-bold text-white">
            قابلیت‌های هسته
          </h2>
          <div className="mt-3">
            <CoreCapabilities />
>>>>>>> 91b0962d71cf10e61b94692da758db74b7b57016
          </div>
        </motion.div>
      </section>

<<<<<<< HEAD
      {/* ===== Intro + KPIs (FA) */}
      <section id="intro" className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-8">
        <h2 className="text-2xl font-bold text-white mb-4">معرفی</h2>
        <p className="text-gray-300">پلتفرم Nexus-AITech نسل جدیدی از ابزارهای تحلیلی و معاملاتی برای بازارهای مالی است.</p>
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          <div><p className="text-3xl font-bold text-emerald-400">48h</p><p className="text-gray-400">Free Trial</p></div>
          <div><p className="text-3xl font-bold text-emerald-400">7+</p><p className="text-gray-400">Exchanges</p></div>
          <div><p className="text-3xl font-bold text-emerald-400">4.9/5</p><p className="text-gray-400">User Rating</p></div>
          <div><p className="text-3xl font-bold text-emerald-400">Realtime</p><p className="text-gray-400">Data</p></div>
        </div>
      </section>

      {/* ===== Capabilities */}
      <section id="capabilities" className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 mt-10">
        <CoreCapabilities />
      </section>

      {/* ===== Data & Signals */}
      <section id="data-overview" className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 mt-10" aria-labelledby="section-data">
        <h2 id="section-data" className="text-2xl font-bold text-white mb-4">Data &amp; Signals</h2>
        <DataOverview />
        <div className="mt-10"><LiveOhlcvTicker /></div>
      </section>

      {/* ===== Supported Exchanges */}
      <section id="integrations" className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 mt-16">
        <h2 className="text-2xl font-bold text-white mb-6">Supported Exchanges</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-6 items-center">
          <img src="/logos/binance.png" alt="Binance" className="h-10 mx-auto" />
          <img src="/logos/bybit.png" alt="Bybit" className="h-10 mx-auto" />
          <img src="/logos/okx.png" alt="OKX" className="h-10 mx-auto" />
          <img src="/logos/coinex.png" alt="CoinEx" className="h-10 mx-auto" />
          <img src="/logos/bitget.png" alt="Bitget" className="h-10 mx-auto" />
          <img src="/logos/bingx.png" alt="BingX" className="h-10 mx-auto" />
          <img src="/logos/kucoin.png" alt="KuCoin" className="h-10 mx-auto" />
        </div>
      </section>

      {/* ===== Social proof / Feedback */}
      <section id="feedback" className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 mt-12">
        <Feedback />
      </section>

      {/* bottom gradient fade */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />
    </div>
  )
=======
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
>>>>>>> 91b0962d71cf10e61b94692da758db74b7b57016
}
