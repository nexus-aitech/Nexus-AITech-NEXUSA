"use client";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export function ShellNav() {
  return (
    <header className="border-b border-white/10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-3 gap-3">
          <div className="flex items-center gap-3">
            <Logo />
            <div className="font-black tracking-tight text-white">NEXUSA</div>
            <div className="hidden sm:block text-xs text-white/50">AI Signals & Backtesting</div>
          </div>
          <nav className="flex items-center gap-2">
            <Link className="px-3 py-2 text-sm rounded-xl text-white/80 hover:text-white border border-white/20 hover:border-white/40" href="/">خانه</Link>
            <Link className="px-3 py-2 text-sm rounded-xl text-white/80 hover:text-white border border-white/20 hover:border-white/40" href="/about">راهنما</Link>
            <Link className="px-3 py-2 text-sm rounded-xl text-white/80 hover:text-white border border-white/20 hover:border-white/40" href="/reports">گزارش‌ها</Link>
            <Link className="px-3 py-2 text-sm rounded-xl text-white/80 hover:text-white border border-white/20 hover:border-white/40" href="/feedback">نظرات</Link>
            <Link className="px-3 py-2 text-sm rounded-xl text-white/80 hover:text-white border border-white/20 hover:border-white/40" href="/contact">تماس</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link className="rounded-2xl px-4 py-2 border border-white/20 text-white/90 hover:border-white/40" href="/pricing">قیمت‌ها</Link>
            <Link className="rounded-2xl px-4 py-2 bg-white text-slate-900 font-semibold shadow hover:shadow-lg active:scale-[.99]" href="/signup">ثبت‌نام</Link>
          </div>
        </div>
      </div>
    </header>
  );
}
