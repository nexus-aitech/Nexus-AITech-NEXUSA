"use client";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Menu, X, Sun, Moon, ChevronDown, Globe2 } from "lucide-react";

/**
 * ShellNav – Global top navigation (production‑ready)
 * - Sticky, translucent, backdrop‑blur, scroll shadow
 * - Responsive: desktop menu + mobile drawer
 * - Active link highlighting
 * - Theme switch (light/dark/system)
 * - i18n quick toggle (en/fa) – optional links
 * - Auth buttons (Sign in / Sign up) or user avatar placeholder
 */

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/data-signals", label: "Data" },
  { href: "/backtesting", label: "Backtesting" },
  { href: "/charts", label: "Charts" },
  { href: "/pricing", label: "Pricing" },
];

function useActivePath() {
  const pathname = usePathname() || "/";
  return useMemo(() => pathname, [pathname]);
}

function ThemeToggle() {
  const [mode, setMode] = useState<string>("system");
  useEffect(() => {
    try {
      const pref = localStorage.getItem("theme") || "system";
      setMode(pref);
    } catch {}
  }, []);
  function apply(next: string) {
    try {
      localStorage.setItem("theme", next);
      const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const isDark = next === "dark" || (next === "system" && sysDark);
      const cls = document.documentElement.classList;
      if (isDark) cls.add("dark"); else cls.remove("dark");
      document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
      setMode(next);
    } catch {}
  }
  return (
    <div className="relative">
      <button
        onClick={() => apply(mode === "light" ? "dark" : mode === "dark" ? "system" : "light")}
        className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
        aria-label="Toggle theme"
        title={`Theme: ${mode}`}
      >
        {mode === "dark" ? <Moon className="h-4 w-4"/> : mode === "light" ? <Sun className="h-4 w-4"/> : <><Sun className="h-4 w-4"/><ChevronDown className="h-3 w-3 opacity-70"/></>}
        <span className="hidden sm:inline capitalize">{mode}</span>
      </button>
    </div>
  );
}

export default function ShellNav() {
  const active = useActivePath();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setOpen(false); }, [active]);

  return (
    <header className={cn(
      "sticky top-0 z-40 w-full",
      scrolled ? "drop-shadow-[0_8px_30px_rgba(2,6,23,0.35)]" : ""
    )}>
      <div className={cn(
        "mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8",
        "backdrop-blur-xl border-b border-white/10",
        "bg-[linear-gradient(to_right,rgba(9,12,20,0.6),rgba(9,12,20,0.35))]"
      )}>
        {/* Left: Brand */}
        <div className="flex items-center gap-3">
          <Link href="/" className="group flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-400 to-blue-600 ring-2 ring-white/10" />
            <span className="text-lg font-extrabold tracking-tight group-hover:opacity-90">NEXUSA</span>
          </Link>
          <span className="hidden sm:inline text-xs text-white/60">AI Signals & Backtesting</span>
        </div>

        {/* Center: Desktop menu */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "px-3 py-2 text-sm rounded-lg border border-transparent hover:border-white/10 hover:bg-white/5",
                active === l.href && "bg-white/10 border-white/10 text-white"
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          <Link href="/fa" className="hidden sm:inline-flex items-center gap-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" title="فارسی">
            <Globe2 className="h-4 w-4"/>
            <span>FA</span>
          </Link>
          <ThemeToggle />
          <div className="hidden sm:flex items-center gap-2">
            <Button href="/signin" variant="outline" size="sm">Sign in</Button>
            <Button href="/signup" size="sm">Sign up</Button>
          </div>
          {/* Mobile burger */}
          <button
            className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 p-2 md:hidden"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5"/>
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-50 md:hidden transition",
          open ? "pointer-events-auto" : "pointer-events-none"
        )}
      >
        <div
          className={cn(
            "absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity",
            open ? "opacity-100" : "opacity-0"
          )}
          onClick={() => setOpen(false)}
        />
        <aside
          className={cn(
            "absolute right-0 top-0 h-full w-[84%] max-w-sm border-l border-white/10 bg-[#0b1220] p-4 shadow-2xl transition-transform",
            open ? "translate-x-0" : "translate-x-full"
          )}
        >
          <div className="mb-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-400 to-blue-600 ring-2 ring-white/10" />
              <span className="text-base font-extrabold">NEXUSA</span>
            </Link>
            <button className="rounded-xl border border-white/15 bg-white/5 p-2" aria-label="Close menu" onClick={() => setOpen(false)}>
              <X className="h-5 w-5"/>
            </button>
          </div>

          <nav className="space-y-1">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "block rounded-xl px-3 py-2 text-sm hover:bg-white/5",
                  active === l.href && "bg-white/10"
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="mt-6 space-y-2">
            <Button href="/signin" variant="outline" fullWidth>Sign in</Button>
            <Button href="/signup" fullWidth>Sign up</Button>
          </div>

          <div className="mt-6 flex items-center justify-between gap-2">
            <Link href="/fa" className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10">
              <Globe2 className="h-4 w-4"/> FA
            </Link>
            <ThemeToggle />
          </div>

          <p className="mt-6 text-xs text-white/50">© {new Date().getFullYear()} NEXUSA. All rights reserved.</p>
        </aside>
      </div>
    </header>
  );
}
