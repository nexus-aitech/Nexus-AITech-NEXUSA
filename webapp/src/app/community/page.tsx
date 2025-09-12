import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Community & Gamification | NEXUSA",
  description: "Leaderboards, badges, and community features.",
  alternates: { canonical: "/community" },
};

export default function CommunityPage() {
  return (
    <main dir="rtl" className="mx-auto max-w-6xl p-6 text-white">
      <nav aria-label="breadcrumb" className="text-sm text-white/60">
        <ol className="flex gap-2"><li><Link href="/" className="hover:underline">خانه</Link></li><li>/</li><li className="text-white">Community & Gamification</li></ol>
      </nav>
      <h1 className="mt-4 text-2xl font-bold">Community & Gamification</h1>
      <p className="mt-2 text-white/70">لیدربرد، مدال‌ها و چالش‌ها برای تعامل کاربران.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4"><h2 className="text-lg font-semibold">Leaderboards</h2><p className="mt-1 text-sm text-white/70">رتبه‌بندی براساس سود، ریسک‌پذیری و ثبات.</p></div>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4"><h2 className="text-lg font-semibold">Badges & Quests</h2><p className="mt-1 text-sm text-white/70">گیمیفیکیشن با مدال‌ها و مأموریت‌ها.</p></div>
      </div>
      <div className="mt-10"><Link href="/" className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-sm hover:bg-white/[0.06]">← بازگشت به خانه</Link></div>
    </main>
  );
}
