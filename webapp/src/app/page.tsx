// ==============================================
// File: webapp/src/app/page.tsx
// Adds global Feedback form at the end of the home page
// ==============================================

import { Primary, Ghost } from "@/components/ui/Button";
import { Stat } from "@/components/ui/Stat";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Hero from "@/components/layout/Hero";
import CoreCapabilities from "@/components/sections/CoreCapabilities";
import Feedback from "@/components/sections/Feedback"; // ⬅️ added

export const revalidate = 0;

function Container({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">{children}</div>;
}

export default function HomePage() {
  return (
    <div dir="rtl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Header />
        <Hero />
      </div>

      <Container>
        {/* --- Intro / KPIs (existing) --- */}
        <section className="pt-6">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-[11px] text-white/70">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                آمادهٔ لانچ عمومی
              </div>
              <h1 className="mt-4 text-4xl md:text-5xl font-black tracking-tight text-white">
                NEXUSA
                <span className="text-white/60 font-medium"> – پلتفرم سیگنال، بک‌تست و گزارش‌گیری</span>
              </h1>
              <p className="mt-4 text-white/70 leading-7">
                تحلیل جریان دادهٔ صرافی‌ها، مهندسی ویژگی، موتور سیگنال، بک‌تست و گزارش‌گیری LLM—همه در یک سکوی ماژولار.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/pricing"><Primary>شروع تست رایگان ۴۸ ساعته</Primary></Link>
                <Link href="/about"><Ghost>راهنما</Ghost></Link>
              </div>
              <div className="mt-8 grid grid-cols-3 gap-3">
                <Stat value="6+" label="اکوسیستم صرافی" />
                <Stat value="≤100ms" label="پاسخ‌دهی API" />
                <Stat value=">99.9%" label="آپ‌تایم هدف" />
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
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
        <section className="mt-10">
          <CoreCapabilities />
        </section>

        {/* Integrations */}
        <section className="space-y-3 mt-10">
          <h2 className="text-2xl font-bold text-white">یکپارچه‌شده با</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 opacity-70">
            <div className="rounded-xl border border-white/10 p-4 text-center">Binance</div>
            <div className="rounded-xl border border-white/10 p-4 text-center">OKX</div>
            <div className="rounded-xl border border-white/10 p-4 text-center">Bybit</div>
            <div className="rounded-xl border border-white/10 p-4 text-center">KuCoin</div>
            <div className="rounded-xl border border-white/10 p-4 text-center">CoinEx</div>
            <div className="rounded-xl border border-white/10 p-4 text-center">Bitget</div>
          </div>
        </section>

        {/* Global Feedback (new) */}
        <section className="mt-12">
          <Feedback endpoint="/feedback" />
        </section>
      </Container>
    </div>
  );
}
