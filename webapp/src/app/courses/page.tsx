"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Filter, Clock, GraduationCap, Bookmark, CheckCircle2, Layers, Play } from "lucide-react";

// ------------------------------------------------------------
// NEXUSA — /courses page
// - Lists courses discovered from the provided `education` folder (prebaked below)
// - Features: search, level filters, enroll/save (localStorage), modern dark UI
// - CTA: Enroll / Start
// NOTE: The metadata was extracted by scanning the provided folder structure
//       (README + modules/*.md + notebooks/*.ipynb). You can regenerate later
//       or wire this to a server action if preferred.
// ------------------------------------------------------------

// ---- Types
export type Level = "Beginner" | "Intermediate" | "Advanced";
export type Course = {
  slug: string; // kebab-case (e.g., "fundamental")
  title: string;
  description: string;
  level: Level;
  durationHours: number; // estimated duration
  modules: number;
  notebooks: number;
};

// ---- Prebaked metadata (derived from education/*)
// If you later add more courses, extend this array or fetch from a server.
const COURSES: Course[] = [
  {
    slug: "fundamental",
    title: "دوره پیشرفته تحلیل فاندامنتال رمزارز (Global Institutional Standard)",
    description:
      "این ماژول آموزشی در پلتفرم NEXUSA برای ایجاد یک چارچوب «تحلیل فاندامنتال نهادی» طراحی شده است تا بتوان پروژه‌ها را امتیازدهی، ارزش‌گذاری و مقایسه کرد.",
    level: "Advanced",
    durationHours: 7,
    modules: 3,
    notebooks: 1,
  },
  {
    slug: "macro",
    title: "دوره پیشرفته اقتصاد کلان و ارتباط آن با کریپتو (Global Institutional Standard)",
    description:
      "این ماژول آموزشی در پلتفرم NEXUSA برای تحلیل نهادی اثر متغیرهای کلان (نرخ بهره، تورم، نقدینگی، DXY) و ساخت شاخص‌های ترکیبی و گزارش‌های عمومی است.",
    level: "Advanced",
    durationHours: 7,
    modules: 3,
    notebooks: 1,
  },
  {
    slug: "nft-metaverse",
    title: "دوره آموزشی NFT و متاورس (NEXUSA / NFT & Metaverse)",
    description:
      "این دوره بخشی از پروژه NEXUSA است و به‌عنوان یک ماژول جامع آموزشی/تحلیلی برای ارائه یک چارچوب تحلیلی و عملیاتی در سطح جهانی طراحی شده است.",
    level: "Intermediate",
    durationHours: 7,
    modules: 3,
    notebooks: 1,
  },
  {
    slug: "onchain",
    title: "دوره تحلیل آنچین (NEXUSA / On-chain Analytics) — نسخهٔ ارتقایافتهٔ جهانی",
    description:
      "این دوره بخشی از پروژه NEXUSA است و چارچوبی عملی برای تحلیل جریان کیف‌پول‌ها، ورود/خروج صرافی‌ها و ردیابی نهنگ‌ها ارائه می‌کند.",
    level: "Intermediate",
    durationHours: 7,
    modules: 3,
    notebooks: 1,
  },
];

// ---- Helpers
const LEVEL_ORDER: Record<Level, number> = { Beginner: 0, Intermediate: 1, Advanced: 2 };
const formatDuration = (h: number) => `${h}h`;

// ---- Persistent enrolls
const ENROLL_KEY = "nexusa:courses:enrolled";
const loadEnrolls = (): Set<string> => {
  try {
    const raw = localStorage.getItem(ENROLL_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
};
const saveEnrolls = (s: Set<string>) => {
  try {
    localStorage.setItem(ENROLL_KEY, JSON.stringify(Array.from(s)));
  } catch {
    // ignore
  }
};

// ------------------------------------------------------------
// UI Components
// ------------------------------------------------------------
function LevelBadge({ level }: { level: Level }) {
  const map: Record<Level, string> = {
    Beginner: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    Intermediate: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    Advanced: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  };
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${map[level]}`}>
      <Layers className="h-3.5 w-3.5" /> {level}
    </span>
  );
}

function CourseCard({ c, enrolled, onToggleEnroll }: {
  c: Course;
  enrolled: boolean;
  onToggleEnroll: (slug: string) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ type: "spring", stiffness: 120, damping: 14 }}
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/60 to-slate-950/80 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur-xl hover:shadow-[0_0_30px_0_rgba(88,28,135,0.35)]"
    >
      {/* neon accent */}
      <div className="pointer-events-none absolute inset-x-0 -top-24 h-36 bg-gradient-to-b from-fuchsia-600/20 via-indigo-600/10 to-transparent blur-3xl" />

      <div className="flex items-center justify-between gap-3">
        <LevelBadge level={c.level} />
        <button
          onClick={() => onToggleEnroll(c.slug)}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${
            enrolled
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-sky-500/30 bg-sky-500/10 text-sky-200"
          }`}
        >
          {enrolled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />} {enrolled ? "Enrolled" : "Enroll"}
        </button>
      </div>

      <h3 className="mt-4 line-clamp-2 text-lg font-semibold text-slate-100">{c.title}</h3>
      <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-300/90">{c.description}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-300/80">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1"><Clock className="h-3.5 w-3.5" />{formatDuration(c.durationHours)}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1"><GraduationCap className="h-3.5 w-3.5" />{c.modules} modules</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">🧪 {c.notebooks} notebooks</span>
      </div>

      <div className="mt-5 flex items-center gap-2">
        <Link
          href={`/courses/${c.slug}`}
          className="inline-flex items-center gap-2 rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/15 px-3.5 py-2 text-sm text-fuchsia-200 transition hover:bg-fuchsia-500/25"
        >
          <Play className="h-4 w-4" /> Start
        </Link>
        <button
          onClick={() => onToggleEnroll(c.slug)}
          className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-2 text-sm text-indigo-200 transition hover:bg-indigo-500/20"
        >
          {enrolled ? "Unsave" : "Save"}
        </button>
      </div>
    </motion.div>
  );
}

function Controls({
  q,
  setQ,
  levels,
  toggleLevel,
  onlyEnrolled,
  setOnlyEnrolled,
}: {
  q: string;
  setQ: (v: string) => void;
  levels: Set<Level>;
  toggleLevel: (l: Level) => void;
  onlyEnrolled: boolean;
  setOnlyEnrolled: (v: boolean) => void;
}) {
  const levelOpts: Level[] = ["Beginner", "Intermediate", "Advanced"];
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="relative w-full md:max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300/60" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="جستجو در عنوان/توضیح..."
          className="w-full rounded-2xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-400/60 outline-none ring-0 focus:border-fuchsia-500/40"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300/80"><Filter className="h-3.5 w-3.5" /> سطح:</span>
        {levelOpts.map((l) => (
          <button
            key={l}
            onClick={() => toggleLevel(l)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              levels.has(l)
                ? "border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-200"
                : "border-white/10 bg-white/5 text-slate-300/80 hover:border-white/20"
            }`}
          >
            {l}
          </button>
        ))}

        <button
          onClick={() => setOnlyEnrolled((v) => !v)}
          className={`ml-1 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${
            onlyEnrolled
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
              : "border-white/10 bg-white/5 text-slate-300/80 hover:border-white/20"
          }`}
        >
          <Bookmark className="h-3.5 w-3.5" /> فقط ثبت‌نام‌شده‌ها
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Page Component
// ------------------------------------------------------------
export default function CoursesPage() {
  const [q, setQ] = useState("");
  const [levels, setLevels] = useState<Set<Level>>(new Set(["Beginner", "Intermediate", "Advanced"]));
  const [enrolled, setEnrolled] = useState<Set<string>>(new Set());
  const [onlyEnrolled, setOnlyEnrolled] = useState(false);

  // load persisted enrolls
  useEffect(() => {
    setEnrolled(loadEnrolls());
  }, []);

  const toggleLevel = (l: Level) =>
    setLevels((prev) => {
      const next = new Set(prev);
      next.has(l) ? next.delete(l) : next.add(l);
      return next.size ? next : prev; // prevent empty filter
    });

  const onToggleEnroll = (slug: string) => {
    setEnrolled((prev) => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      saveEnrolls(next);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const qn = q.trim().toLowerCase();
    return COURSES
      .filter((c) => levels.has(c.level))
      .filter((c) => (onlyEnrolled ? enrolled.has(c.slug) : true))
      .filter((c) =>
        qn
          ? c.title.toLowerCase().includes(qn) || c.description.toLowerCase().includes(qn)
          : true,
      )
      .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.title.localeCompare(b.title));
  }, [q, levels, onlyEnrolled, enrolled]);

  return (
    <div className="relative min-h-screen w-full bg-[#070712] text-slate-100">
      {/* background grid + glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(124,58,237,0.15),rgba(2,6,23,0))]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:24px_24px]" />
      </div>

      <main className="relative mx-auto max-w-7xl px-4 pb-16 pt-10">
        <header className="mb-8">
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-2xl font-bold tracking-tight text-slate-100 md:text-3xl"
          >
            دوره‌ها (Beginner → Advanced)
          </motion.h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-300/80">
            لیست دوره‌های NEXUSA با طراحی مدرن (Dark Futuristic). قابلیت فیلتر سطح، جستجو و ذخیره‌سازی دوره‌های ثبت‌نام‌شده.
          </p>
        </header>

        <Controls
          q={q}
          setQ={setQ}
          levels={levels}
          toggleLevel={toggleLevel}
          onlyEnrolled={onlyEnrolled}
          setOnlyEnrolled={setOnlyEnrolled}
        />

        {/* count */}
        <div className="mt-4 text-xs text-slate-400">{filtered.length} نتیجه</div>

        <section className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((c) => (
              <CourseCard
                key={c.slug}
                c={c}
                enrolled={enrolled.has(c.slug)}
                onToggleEnroll={onToggleEnroll}
              />
            ))}
          </AnimatePresence>
        </section>

        {/* Footer hint */}
        <div className="mt-10 text-center text-xs text-slate-400/80">
          برای هر دوره مسیر جزئیات را می‌توانید روی <code className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">/courses/[slug]</code> بسازید. دکمه‌ی <em>Start</em>
          اکنون به همین مسیر لینک شده است.
        </div>
      </main>
    </div>
  );
}
