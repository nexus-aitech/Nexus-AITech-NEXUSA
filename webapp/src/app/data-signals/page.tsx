import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Data & Signals | NEXUSA",
  description: "Real-time data ingestion, feature engineering, and signal generation.",
  alternates: { canonical: "/data-signals" },
};

export default function DataSignalsPage() {
  return (
    <main dir="rtl" className="mx-auto max-w-6xl p-6 text-white">
      <nav aria-label="breadcrumb" className="text-sm text-white/60">
        <ol className="flex gap-2"><li><Link href="/" className="hover:underline">خانه</Link></li><li>/</li><li className="text-white">Data & Signals</li></ol>
      </nav>
      <h1 className="mt-4 text-2xl font-bold">Data & Signals</h1>
      <p className="mt-2 text-white/70">ورود به ماژول دریافت داده، پاکسازی، مهندسی ویژگی‌ها و تولید سیگنال‌های بلادرنگ.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4"><h2 className="text-lg font-semibold">Ingestion</h2><p className="mt-1 text-sm text-white/70">اتصال به صرافی‌ها، استریم و Batch.</p></div>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4"><h2 className="text-lg font-semibold">Feature Engine</h2><p className="mt-1 text-sm text-white/70">استخراج اندیکاتورها و ویژگی‌های ترکیبی.</p></div>
      </div>
      <div className="mt-10"><Link href="/" className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-sm hover:bg-white/[0.06]">← بازگشت به خانه</Link></div>
    </main>
  );
}
