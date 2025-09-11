// webapp/src/components/sections/CoreCapabilities.tsx
"use client";
import React from "react";
import Link from "next/link";
import Image from "next/image";
import { LineChart as LineChartIcon } from "lucide-react";
import { CitationPopover } from "@/components/shared/CitationPopover";
import { Zap, FileText, FlaskConical, Trophy } from "lucide-react";

// اختیاری: برای fallback اگر فایل‌های SVG نبودند


// نکته: فایل‌های SVG را در public/icons بگذار:
// /public/icons/bolt.svg, /public/icons/report.svg, /public/icons/beaker.svg, /public/icons/trophy.svg
// آدرس نهایی در مرورگر: /icons/bolt.svg و ...

type Card = {
  href: string;
  title: string;
  desc: string;
  testid: string;
  iconWrap: string;          // کلاس‌های گرادیان پس‌زمینه
  iconSrc?: string;          // مسیر آیکون از public/ (مثلاً "/icons/bolt.svg")
  icon?: React.ReactNode;    // fallback (lucide) وقتی iconSrc موجود نیست
};

const cards: Card[] = [
  {
    href: "/data-signals",
    title: "Data & Signals",
    desc: "Real-time data & feature pipeline",
    testid: "nav-card-data-signals",
    iconWrap: "from-amber-300/95 to-yellow-500/90",
    iconSrc: "/icons/bolt.svg",
    icon: <Zap className="h-5 w-5" aria-hidden />,
  },
  {
    href: "/reports",
    title: "Reports",
    desc: "Indicators & AI-generated insights",
    testid: "nav-card-reports",
    iconWrap: "from-sky-400/95 to-blue-600/90",
    iconSrc: "/icons/report.svg",
    icon: <FileText className="h-5 w-5" aria-hidden />,
  },
  {
    href: "/backtesting",
    title: "Backtesting",
    desc: "Strategy learning & evaluation",
    testid: "nav-card-backtesting",
    iconWrap: "from-indigo-400/95 to-violet-600/90",
    iconSrc: "/icons/beaker.svg",
    icon: <FlaskConical className="h-5 w-5" aria-hidden />,
  },
  {
    href: "/community",
    title: "Community & Gamification",
    desc: "Leaderboards, badges, quests",
    testid: "nav-card-community",
    iconWrap: "from-fuchsia-400/95 to-pink-600/90",
    iconSrc: "/icons/trophy.svg",
    icon: <Trophy className="h-5 w-5" aria-hidden />,
  },
  {
  href: "/charts",
  title: "Charts & Analytics",
  desc: "Interactive multi-series charts",
  testid: "nav-card-charts",
  iconWrap: "from-emerald-400/95 to-teal-600/90",
  iconSrc: "/icons/chart.svg",
  icon: <LineChartIcon className="h-5 w-5" aria-hidden />,
},
];

export default function CoreCapabilities() {
  return (
    <section
      aria-labelledby="core-capabilities"
      className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"
    >
      <h2 id="core-capabilities" className="sr-only">
        Core capabilities
      </h2>

      {/* ردیف چهار کارتی مطابق طرح مرجع */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            aria-label={c.title}
            data-testid={c.testid}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,.04),0_12px_30px_-12px_rgba(0,0,0,.7)] backdrop-blur-[2px] transition hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <div className="flex items-start gap-3">
              <div
                className={`inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-b ${c.iconWrap} ring-1 ring-white/15 shadow-[0_10px_25px_-10px_rgba(0,0,0,.6)]`}
              >
                {/* اگر iconSrc موجود است، تصویر SVG ذخیره‌شده را نشان بده؛ وگرنه fallback */}
                {c.iconSrc ? (
                  <Image src={c.iconSrc} width={20} height={20} alt="" aria-hidden />
                ) : (
                  c.icon ?? null
                )}
              </div>

              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-white">{c.title}</div>
                <p className="mt-0.5 truncate text-[12px] leading-5 text-white/60">
                  {c.desc}
                </p>
              </div>
            </div>

            {/* هایلایت پایین کارت مثل مرجع */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          </Link>
        ))}
      </div>
    </section>
  );
}
