import Link from "next/link";
import { Primary, Ghost } from "@/components/ui/Button";

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-16 pb-24" dir="ltr">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-center">
        {/* Left Content */}
        <div>
          {/* Headline */}
          <h1 className="text-5xl md:text-6xl font-black tracking-tight text-white leading-tight">
            🚀 NEXUSA
            <span className="text-white/60 font-medium">
              {" "}— AI-Powered Real-Time Crypto Intelligence & Education
            </span>
          </h1>

          {/* Subheadline */}
          <p className="mt-6 text-lg text-white/70 leading-8 max-w-xl">
            A next-generation modular platform uniting real-time crypto market
            analysis, adaptive learning, and AI-driven decision automation.
          </p>

          {/* Project overview (3 pillars) */}
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-white font-bold mb-2">Analysis</h3>
              <p className="text-white/70 text-sm leading-6">
                Ultra-fast ingestion (≤40ms), key indicators (Ichimoku, ADX,
                VWAP…), hybrid rule + ML signals, multilingual LLM reports.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-white font-bold mb-2">Education</h3>
              <p className="text-white/70 text-sm leading-6">
                24/7 AI Tutor (LLM+RAG), hands-on labs, adaptive learning,
                quizzes & digital certification — from beginner to pro.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-white font-bold mb-2">Ecosystem</h3>
              <p className="text-white/70 text-sm leading-6">
                TradingView-like dashboards with smart signals, gamification,
                community, and multi-region scalability (150K msg/s).
              </p>
            </div>
          </div>

          {/* CTAs */}
          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/pricing"><Primary size="lg">🚀 Free Trial</Primary></Link>
            <Link href="/docs"><Ghost size="lg">📄 Docs</Ghost></Link>
            <Link href="/demo"><Ghost size="lg">🎥 Demo</Ghost></Link>
          </div>
        </div>

        {/* Right Embed Area */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 flex items-center justify-center h-[420px]">
          <div className="text-center w-full">
            <div className="text-sm text-white/60 mb-4">Live Interactive Preview</div>
            <div className="rounded-xl border border-white/10 bg-black/50 p-6 h-72 flex items-center justify-center text-white/70">
              <span className="text-white/50">
                [ Embed: Real-time Dashboard + AI Tutor Widget ]
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
