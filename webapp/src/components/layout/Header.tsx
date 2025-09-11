import Link from "next/link";
import { useState, useEffect } from "react";
import { Primary, Ghost } from "@/components/ui/Button";
import { Logo } from "@/components/branding/Logo";

export default function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      dir="ltr"
      className={`sticky top-0 z-50 transition-[background,backdrop-filter,box-shadow] ${
        scrolled
          ? "bg-black/50 backdrop-blur supports-[backdrop-filter]:backdrop-blur-xl shadow-[0_10px_30px_-15px_rgba(0,0,0,.5)]"
          : "bg-transparent"
      }`}
      role="navigation"
      aria-label="Global navigation"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Logo href="/" variant="full" size={28} label="Nexus-AITech Home" />
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-400/20 text-emerald-300 font-black">N</span>
            <div>
              <div className="text-white font-extrabold tracking-tight leading-none">NEXUSA</div>
              <div className="text-[10px] text-white/60 -mt-0.5">AI • Signals • Backtesting • Education</div>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-1">
            <HeaderLink href="/docs">Docs</HeaderLink>
            <HeaderLink href="/pricing">Pricing</HeaderLink>
            <HeaderLink href="/about">About</HeaderLink>
            <HeaderLink href="/contact">Contact</HeaderLink>
          </nav>

          <div className="hidden lg:flex items-center gap-3">
            <Link href="/auth/signin" aria-label="Sign in"><Ghost size="sm">Sign in</Ghost></Link>
            <Link href="/auth/signup" aria-label="Sign up"><Ghost size="sm">Sign up</Ghost></Link>
            <Link href="/demo" aria-label="Live demo"><Ghost size="sm">Demo</Ghost></Link>
            <Link href="/pricing" aria-label="Start free trial"><Primary size="sm">Free Trial</Primary></Link>
          </div>

          <button
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-white/80 hover:bg-white/10"
          >
            <span className="sr-only">Menu</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="pointer-events-none">
              {open ? (
                <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      <div className={`lg:hidden overflow-hidden transition-[max-height,opacity] ${open ? "max-h-[60vh] opacity-100" : "max-h-0 opacity-0"}`}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-6">
          <div className="grid gap-3">
            <MobileLink href="/docs" label="Docs" />
            <MobileLink href="/pricing" label="Pricing" />
            <MobileLink href="/about" label="About" />
            <MobileLink href="/contact" label="Contact" />
            <div className="h-px bg-white/10 my-2" />
            <MobileLink href="/auth/signin" label="Sign in" />
            <MobileLink href="/auth/signup" label="Sign up" />
            <MobileLink href="/demo" label="Demo" />
            <Link href="/pricing" className="mt-2" aria-label="Start free trial">
              <Primary className="w-full">Free Trial</Primary>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

function HeaderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="px-3 py-2 text-sm rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition">
      {children}
    </Link>
  );
}

function MobileLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white/90 text-sm">
      {label}
    </Link>
  );
}
