'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { ArrowRight, PlayCircle, FileText, ShieldCheck, Zap, Sparkles, LineChart, GraduationCap } from 'lucide-react'

/**
 * NEXUSA – Global‑grade Hero section
 * - World‑class visual hierarchy, crisp typography, and motion
 * - a11y‑first: semantic headings, labels, visible focus, reduced‑motion safe
 * - Responsive two‑column layout (content + live preview container)
 * - Trust badges, KPIs, and primary CTAs
 * - Zero unknown components (pure shadcn Button variants)
 */
export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-16 pb-24" aria-labelledby="hero-title" dir="ltr">
      {/* Decorative gradients */}
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full blur-3xl bg-gradient-to-tr from-emerald-400/20 via-sky-400/10 to-indigo-400/10" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full blur-3xl bg-gradient-to-tr from-indigo-400/10 via-fuchsia-400/10 to-emerald-400/20" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-center">
        {/* ===== Left: Content */}
        <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, ease: 'easeOut' }}>
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
            <Sparkles className="h-3.5 w-3.5" /> <span>AI‑first • Real‑time • Web3‑native</span>
          </div>

          {/* Headline */}
          <h1 id="hero-title" className="mt-4 text-5xl md:text-6xl font-black tracking-tight text-white leading-[1.05]">
            NEXUSA
            <span className="block bg-gradient-to-r from-emerald-200 via-sky-200 to-indigo-200 bg-clip-text text-transparent">AI‑Powered Crypto Intelligence & Education</span>
          </h1>

          {/* Subheadline */}
          <p className="mt-5 text-lg text-white/80 leading-8 max-w-xl">
            A modular platform that unifies low‑latency market ingestion, ML‑driven signals, backtesting, and adaptive learning — so you can research, validate, and deploy faster.
          </p>

          {/* 3 pillars */}
          <div className="mt-7 grid gap-4 sm:grid-cols-3">
            <FeaturePill icon={<LineChart className="h-4 w-4" />} title="Analysis" desc="≤40ms ingest • Ichimoku, ADX, VWAP • hybrid ML+rules" />
            <FeaturePill icon={<GraduationCap className="h-4 w-4" />} title="Education" desc="LLM Tutor • adaptive paths • labs • quizzes" />
            <FeaturePill icon={<Zap className="h-4 w-4" />} title="Execution" desc="Signals → backtests → live, with observability" />
          </div>

          {/* CTAs */}
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/pricing" aria-label="Start free trial">
              <Button size="lg" className="rounded-xl inline-flex items-center gap-2">
                <span>Start Free Trial</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/demo" aria-label="Watch product demo">
              <Button variant="ghost" size="lg" className="rounded-xl inline-flex items-center gap-2">
                <PlayCircle className="h-5 w-5" />
                <span>Watch Demo</span>
              </Button>
            </Link>
            <Link href="/docs" aria-label="Read documentation">
              <Button variant="ghost" size="lg" className="rounded-xl inline-flex items-center gap-2">
                <FileText className="h-5 w-5" />
                <span>Docs</span>
              </Button>
            </Link>
          </div>

          {/* Trust bar */}
          <div className="mt-8 flex flex-wrap items-center gap-4 text-white/60">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-sm">TLS‑everywhere • OAuth • RBAC • Audit</span>
            <span className="mx-2 opacity-40">•</span>
            <span className="text-sm">SOC‑ready architecture</span>
          </div>

          {/* KPIs */}
          <dl className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-6">
            <Kpi label="Free Trial" value="48h" />
            <Kpi label="Exchanges" value="7+" />
            <Kpi label="User Rating" value="4.9/5" />
            <Kpi label="Throughput" value="150k msg/s" />
          </dl>
        </motion.div>

        {/* ===== Right: Live preview / media */}
        <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, ease: 'easeOut' }}>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="text-sm text-white/70">Live Interactive Preview</div>
              <div className="flex items-center gap-2 text-[10px] text-white/50">
                <span>Realtime</span>
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
              </div>
            </div>

            {/* Replace this placeholder with your actual widget / chart embed */}
            <div className="mt-4 rounded-xl border border-white/10 bg-black/60 p-6 h-[420px] flex items-center justify-center">
              <span className="text-white/60 text-sm">[ Embed: Realtime Dashboard + AI Tutor Widget ]</span>
            </div>

            {/* Mini badges / logos row (optional) */}
            <div className="mt-4 grid grid-cols-3 gap-3 opacity-80">
              <LogoBadge src="/logos/binance.png" alt="Binance" />
              <LogoBadge src="/logos/okx.png" alt="OKX" />
              <LogoBadge src="/logos/kucoin.png" alt="KuCoin" />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

function FeaturePill({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-2 text-white font-semibold mb-1">{icon}<span>{title}</span></div>
      <p className="text-white/70 text-sm leading-6">{desc}</p>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-3xl font-extrabold text-emerald-400">{value}</div>
      <div className="text-xs text-white/60">{label}</div>
    </div>
  )
}

function LogoBadge({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative h-10 w-full rounded-lg border border-white/10 bg-white/5">
      <Image src={src} alt={alt} fill className="object-contain p-2" sizes="(max-width: 768px) 33vw, 10vw" />
    </div>
  )
}
