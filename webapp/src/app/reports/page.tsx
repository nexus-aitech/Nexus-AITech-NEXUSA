// ==============================================
// File: webapp/src/app/reports/page.tsx
// Adds CitationPopover under the report content (no 404). Server component safe via dynamic import.
// ==============================================
import Link from "next/link";
import dynamic from "next/dynamic";

// Lazy-load client-only component to keep this page as a Server Component
const CitationPopover = dynamic(
  () => import("@/components/shared/CitationPopover").then((m) => m.CitationPopover),
  { ssr: false }
);

export const metadata = {
  title: "Reports — NEXUSA",
  description: "LLM-powered reports and analytics",
};

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


// ==============================================
// File: webapp/src/app/charts/page.tsx
// World-class professional charts dashboard (client component).
// ==============================================
"use client";

import * as React from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

// --- Types ---
interface Point { t: number; price: number; volume: number; pnl: number }

type Timeframe = "1D" | "1W" | "1M" | "3M" | "1Y";

// --- Utils ---
function fmtDate(ts: number) {
  const d = new Date(ts);
  return d.toLocaleDateString("fa-IR", { month: "short", day: "2-digit" });
}

function genSeries(tf: Timeframe, seed = 1, base = 100): Point[] {
  const now = Date.now();
  const steps: Record<Timeframe, number> = { "1D": 24, "1W": 7 * 24, "1M": 30, "3M": 13, "1Y": 52 };
  const stepMs: Record<Timeframe, number> = { "1D": 60 * 60 * 1000, "1W": 60 * 60 * 1000, "1M": 24 * 60 * 60 * 1000, "3M": 7 * 24 * 60 * 60 * 1000, "1Y": 7 * 24 * 60 * 60 * 1000 };
  const n = steps[tf];
  const ms = stepMs[tf];
  let price = base;
  const out: Point[] = [];
  for (let i = n - 1; i >= 0; i--) {
    // pseudo random
    seed = (seed * 9301 + 49297) % 233280;
    const rand = seed / 233280 - 0.5; // -0.5..0.5
    price = Math.max(1, price * (1 + rand * 0.03));
    const volume = 1000 + Math.abs(rand) * 500 + (i % 5 === 0 ? 600 : 0);
    const pnl = (price - base) / base * 100;
    out.push({ t: now - i * ms, price: Number(price.toFixed(2)), volume: Math.round(volume), pnl: Number(pnl.toFixed(2)) });
  }
  return out;
}

const symbols = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT"] as const;

export default function ChartsPage() {
  const [tf, setTf] = React.useState<Timeframe>("1M");
  const [sym, setSym] = React.useState<typeof symbols[number]>("BTC/USDT");
  const [data, setData] = React.useState<Point[]>(() => genSeries("1M", 7, 100));

  React.useEffect(() => {
    const seed = 5 + symbols.indexOf(sym) * 7 + (tf === "1D" ? 3 : tf === "1W" ? 5 : tf === "1M" ? 7 : tf === "3M" ? 9 : 11);
    setData(genSeries(tf, seed, 100));
  }, [tf, sym]);

  // KPIs
  const last = data[data.length - 1];
  const first = data[0];
  const change = last && first ? ((last.price - first.price) / first.price) * 100 : 0;

  return (
    <div dir="rtl" className="mx-auto max-w-7xl p-6">
      <nav className="text-xs text-white/60">
        <Link href="/" className="hover:text-white">خانه</Link>
        <span className="mx-2">/</span>
        <span>Charts &amp; Analytics</span>
      </nav>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Charts &amp; Analytics</h1>
          <p className="mt-1 text-white/70">نمایش قیمت/حجم، KPIها و تحلیل‌های سریع برای نمادهای منتخب.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SymbolSelect value={sym} onChange={setSym} />
          <TimeframeTabs value={tf} onChange={setTf} />
        </div>
      </div>

      {/* KPI Cards */}
      <section className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="قیمت فعلی" value={last?.price?.toLocaleString("fa-IR")} hint={sym} />
        <KPI label="تغییر دوره" value={`${change.toFixed(2)}%`} trend={change} />
        <KPI label="میانگین حجم" value={Math.round(data.reduce((a,b)=>a+b.volume,0)/data.length).toLocaleString("fa-IR")} />
        <KPI label="PnL تجمعی" value={`${last?.pnl?.toFixed(2)}%`} trend={last?.pnl ?? 0} />
      </section>

      {/* Price AreaChart */}
      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-white/90 font-semibold">قیمت {sym}</h2>
          <span className="text-xs text-white/60">بازه: {tf}</span>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="gPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopOpacity={0.8} />
                  <stop offset="100%" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="t" tickFormatter={fmtDate} minTickGap={24} stroke="#A1A1AA" />
              <YAxis width={56} stroke="#A1A1AA" />
              <Tooltip content={<Tip fmt={fmtDate} />} />
              <Area type="monotone" dataKey="price" strokeWidth={2} fillOpacity={1} fill="url(#gPrice)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Volume BarChart + PnL Line */}
      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-white/90 font-semibold">حجم و PnL</h2>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <Composed data={data} fmt={fmtDate} />
          </ResponsiveContainer>
        </div>
      </section>

      {/* Table (compact) */}
      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="mb-3 text-white/90 font-semibold">دادهٔ خام (نمونه)</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="text-white/60">
              <tr>
                <th className="py-2 pr-2">تاریخ</th>
                <th className="py-2 pr-2">قیمت</th>
                <th className="py-2 pr-2">حجم</th>
                <th className="py-2 pr-2">PnL%</th>
              </tr>
            </thead>
            <tbody>
              {data.slice(-20).map((p) => (
                <tr key={p.t} className="border-t border-white/10">
                  <td className="py-2 pr-2 text-white/70">{fmtDate(p.t)}</td>
                  <td className="py-2 pr-2 text-white">{p.price.toLocaleString("fa-IR")}</td>
                  <td className="py-2 pr-2 text-white/80">{p.volume.toLocaleString("fa-IR")}</td>
                  <td className="py-2 pr-2 text-white/80">{p.pnl.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="mt-8 text-center text-[11px] text-white/50">
        * داده‌ها نمونه هستند. در اتصال واقعی، این صفحه از ماژول data/feature-engine شما فید می‌گیرد.
      </footer>
    </div>
  );
}

function KPI({ label, value, hint, trend = 0 }: { label: string; value?: string | number; hint?: string; trend?: number }) {
  const up = trend >= 0;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="text-xs text-white/60">{label}</div>
      <div className="mt-1 text-xl font-semibold text-white tabular-nums">{value ?? "—"}</div>
      <div className="mt-1 text-[11px] text-white/60">
        {hint && <span className="mr-2">{hint}</span>}
        {trend !== 0 && (
          <span className={up ? "text-emerald-400" : "text-rose-400"}>{up ? "▲" : "▼"} {Math.abs(trend).toFixed(2)}%</span>
        )}
      </div>
    </div>
  );
}

function TimeframeTabs({ value, onChange }: { value: Timeframe; onChange: (v: Timeframe) => void }) {
  const items: Timeframe[] = ["1D", "1W", "1M", "3M", "1Y"];
  return (
    <div className="flex overflow-hidden rounded-xl border border-white/10">
      {items.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={
            "px-3 py-1.5 text-xs transition " +
            (value === t ? "bg-white/20 text-white" : "bg-white/5 text-white/80 hover:bg-white/10")
          }
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function SymbolSelect({ value, onChange }: { value: string; onChange: (v: any) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-white/80">
      <span>نماد:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-white focus:outline-none"
      >
        {symbols.map((s) => (
          <option key={s} value={s} className="bg-black">
            {s}
          </option>
        ))}
      </select>
    </label>
  );
}

function Tip({ label, active, payload, fmt }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as Point;
  return (
    <div className="rounded-md border border-white/10 bg-black/80 p-2 text-xs text-white/80">
      <div className="font-medium text-white">{fmt(p.t)}</div>
      <div className="mt-1">قیمت: <span className="text-white">{p.price}</span></div>
      {typeof p.volume === "number" && <div>حجم: <span className="text-white">{p.volume}</span></div>}
      {typeof p.pnl === "number" && <div>PnL%: <span className="text-white">{p.pnl}</span></div>}
    </div>
  );
}

function Composed({ data, fmt }: { data: Point[]; fmt: (t: number) => string }) {
  return (
    <LineChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
      <XAxis dataKey="t" tickFormatter={fmt} minTickGap={24} stroke="#A1A1AA" />
      <YAxis yAxisId="left" stroke="#A1A1AA" width={48} />
      <YAxis yAxisId="right" orientation="right" stroke="#A1A1AA" width={48} />
      <Tooltip content={<Tip fmt={fmt} />} />
      <Bar yAxisId="left" dataKey="volume" opacity={0.65} />
      <Line yAxisId="right" type="monotone" dataKey="pnl" strokeWidth={2} dot={false} />
    </LineChart>
  );
}
