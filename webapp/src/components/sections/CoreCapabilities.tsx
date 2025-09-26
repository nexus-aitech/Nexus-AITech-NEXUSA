// webapp/src/components/sections/CoreCapabilities.tsx — Pro Edition
"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Zap,
  FileText,
  FlaskConical,
  Trophy,
  LineChart as LineChartIcon,
  BookOpen,
  CheckSquare,
  Award,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * NOTE: Place optional SVG icons in /public/icons/* if you want branded glyphs.
 * Fallbacks use Lucide icons. This component is resilient: if the custom
 * SVG fails to load, it auto‑switches to the Lucide fallback.
 */

// ---- Icon renderer with graceful fallback
function IconImg({ src, fallback }: { src?: string; fallback: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <>{fallback}</>;
  return (
    <Image
      src={src}
      width={20}
      height={20}
      alt=""
      aria-hidden
      onError={() => setFailed(true)}
      priority={false}
    />
  );
}

// ---- Cards schema
export type CoreCard = {
  href: string;
  title: string;
  desc: string;
  testid: string;
  iconWrap: string; // gradient classes
  iconSrc?: string; // optional /public icon path
  fallback: React.ReactNode; // Lucide fallback
};

const cards: CoreCard[] = [
  {
    href: "/data-signals",
    title: "Data & Signals",
    desc: "Real-time data & feature pipeline",
    testid: "nav-card-data-signals",
    iconWrap: "from-amber-300/95 to-yellow-500/90",
    iconSrc: "/icons/bolt.svg",
    fallback: <Zap className="h-5 w-5" aria-hidden />,
  },
  {
    href: "/reports",
    title: "Reports",
    desc: "Indicators & AI-generated insights",
    testid: "nav-card-reports",
    iconWrap: "from-sky-400/95 to-blue-600/90",
    iconSrc: "/icons/report.svg",
    fallback: <FileText className="h-5 w-5" aria-hidden />,
  },
  {
    href: "/backtesting",
    title: "Backtesting",
    desc: "Strategy learning & evaluation",
    testid: "nav-card-backtesting",
    iconWrap: "from-indigo-400/95 to-violet-600/90",
    iconSrc: "/icons/beaker.svg",
    fallback: <FlaskConical className="h-5 w-5" aria-hidden />,
  },
  {
    href: "/community",
    title: "Community & Gamification",
    desc: "Leaderboards, badges, quests",
    testid: "nav-card-community",
    iconWrap: "from-fuchsia-400/95 to-pink-600/90",
    iconSrc: "/icons/trophy.svg",
    fallback: <Trophy className="h-5 w-5" aria-hidden />,
  },
  {
    href: "/charts",
    title: "Charts & Analytics",
    desc: "Interactive multi-series charts",
    testid: "nav-card-charts",
    iconWrap: "from-emerald-400/95 to-teal-600/90",
    iconSrc: "/icons/chart.svg",
    fallback: <LineChartIcon className="h-5 w-5" aria-hidden />,
  },
  // --- New: these five were missing visually if imports failed
  {
    href: "/indicators",
    title: "Indicators",
    desc: "Classic & custom technical indicators",
    testid: "nav-card-indicators",
    iconWrap: "from-green-400/95 to-emerald-600/90",
    iconSrc: "/icons/indicators.svg",
    fallback: <LineChartIcon className="h-5 w-5" aria-hidden />,
  },
  {
    href: "/courses",
    title: "Courses",
    desc: "Structured learning modules",
    testid: "nav-card-courses",
    iconWrap: "from-cyan-400/95 to-sky-600/90",
    iconSrc: "/icons/courses.svg",
    fallback: <BookOpen className="h-5 w-5" aria-hidden />,
  },
  {
    href: "/quiz-projects",
    title: "Quiz & Projects",
    desc: "Interactive tests and real cases",
    testid: "nav-card-quiz-projects",
    iconWrap: "from-orange-400/95 to-amber-600/90",
    iconSrc: "/icons/quiz.svg",
    fallback: <CheckSquare className="h-5 w-5" aria-hidden />,
  },
  {
    href: "/certification",
    title: "Certification",
    desc: "Earn verifiable certificates",
    testid: "nav-card-certification",
    iconWrap: "from-purple-400/95 to-violet-600/90",
    iconSrc: "/icons/certification.svg",
    fallback: <Award className="h-5 w-5" aria-hidden />,
  },
  {
    href: "/profile",
    title: "Profile",
    desc: "Personal dashboard & settings",
    testid: "nav-card-profile",
    iconWrap: "from-pink-400/95 to-rose-600/90",
    iconSrc: "/icons/profile.svg",
    fallback: <User className="h-5 w-5" aria-hidden />,
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

      {/* 4‑column grid on desktop, fluid and accessible */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            aria-label={c.title}
            data-testid={c.testid}
            className={cn(
              "group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4",
              "shadow-[inset_0_1px_0_0_rgba(255,255,255,.04),0_12px_30px_-12px_rgba(0,0,0,.7)] backdrop-blur-[2px]",
              "transition hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-b ring-1 ring-white/15",
                  "shadow-[0_10px_25px_-10px_rgba(0,0,0,.6)]",
                  c.iconWrap
                )}
              >
                <IconImg src={c.iconSrc} fallback={c.fallback} />
              </div>

              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-white">{c.title}</div>
                <p className="mt-0.5 truncate text-[12px] leading-5 text-white/60">{c.desc}</p>
              </div>
            </div>

            {/* bottom glow */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          </Link>
        ))}
      </div>
    </section>
  );
}
