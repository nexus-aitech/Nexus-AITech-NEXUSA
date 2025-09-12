// ==============================================
// File: webapp/src/app/reports/page.tsx
// Adds CitationPopover under the report content (no 404). Server component safe via dynamic import.
// ==============================================
"use client";
export const dynamic = "force-dynamic";

import Link from "next/link";
import NextDynamic from "next/dynamic";

const CitationPopover = NextDynamic(
  () => import("@/components/shared/CitationPopover").then(m => m.CitationPopover),
  { ssr: false }
);

export default function ReportsPage() {
  return (
    <div dir="rtl" className="mx-auto max-w-6xl p-6">
      <nav className="text-xs text-white/60">
        <Link href="/" className="hover:text-white">خانه</Link>
        <span className="mx-2">/</span>
        <span>Reports</span>
      </nav>

      <h1 className="mt-3 text-2xl font-bold text-white">Reports</h1>
      <p className="mt-2 text-white/70">گزارش‌های تولیدشده توسط LLM بر اساس نتایج سیگنال و بک‌تست.</p>

      {/* --- Sample report content block (placeholder) --- */}
      <section className="mt-6 space-y-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">گزارش نمونه</h2>
          <p className="mt-2 text-white/70 text-sm leading-7">
            این یک متن نمونه برای گزارش است. در نسخهٔ واقعی، این بخش با خروجی LLM، جدول نتایج و نمودارها تکمیل می‌شود.
          </p>
          <div className="mt-3">
            <CitationPopover
              items={[
                {
                  title: "Attention Is All You Need",
                  href: "https://arxiv.org/abs/1706.03762",
                  authors: ["Vaswani et al."],
                  date: "2017",
                  type: "paper",
                  tags: ["transformer"],
                  reliability: 92,
                  snippet: "Introduced the Transformer architecture...",
                },
                "OpenAI Dev Blog",
                { label: "Binance API Docs", href: "https://binance-docs.github.io", type: "web", tags: ["api"] },
              ]}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
