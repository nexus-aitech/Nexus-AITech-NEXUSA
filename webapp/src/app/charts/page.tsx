// webapp/src/app/charts/page.tsx
"use client";
import Link from "next/link";
import Chart from "@/components/ui/Chart";

const demo = [
  { x: "09:00", y: 12 },
  { x: "10:00", y: 18 },
  { x: "11:00", y: 15 },
];

export default function ChartsPage() {
  return (
    <main dir="rtl" className="mx-auto max-w-6xl p-6 text-white">
      <nav className="text-sm text-white/60"><Link href="/" className="hover:underline">خانه</Link> / <span className="text-white">Charts</span></nav>
      <h1 className="mt-4 text-2xl font-bold">Charts & Analytics</h1>
      <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] p-4">
        <Chart data={demo} />
      </div>
    </main>
  );
}
