'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/branding/Logo'
import { motion } from 'framer-motion'
import { Menu, X, ChevronDown } from 'lucide-react'

/**
 * NEXUSA Global‑grade Header
 * - Sticky, translucent, blurred background w/ scroll threshold
 * - Accessible keyboard / screen‑reader labels
 * - Route‑aware active states
 * - Mobile drawer with smooth motion + focusable links
 * - No external, unknown components (uses shadcn Button variants only)
 */
export default function Header() {
  const pathname = usePathname()
  const [open, setOpen] = React.useState(false)
  const [scrolled, setScrolled] = React.useState(false)
  const toggle = () => setOpen(v => !v)

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // close on route change
  React.useEffect(() => { setOpen(false) }, [pathname])

  return (
    <header
      dir="ltr"
      className={[
        'sticky top-0 z-50 transition-[background,backdrop-filter,box-shadow,border-color] border-b',
        scrolled
          ? 'bg-black/50 backdrop-blur supports-[backdrop-filter]:backdrop-blur-xl border-white/10 shadow-[0_10px_30px_-15px_rgba(0,0,0,.5)]'
          : 'bg-transparent border-transparent'
      ].join(' ')}
      role="navigation"
      aria-label="Global navigation"
    >
      {/* Skip link for a11y */}
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[60] rounded-lg bg-emerald-500 px-3 py-2 text-sm text-black">Skip to content</a>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Brand */}
          <Link href="/" aria-label="Nexus-AITech Home" className="group flex items-center gap-2">
            <Logo />
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-400/20 text-emerald-300 font-black">N</span>
            <div>
              <div className="text-white font-extrabold tracking-tight leading-none group-hover:text-emerald-200 transition-colors">NEXUSA</div>
              <div className="text-[10px] text-white/60 -mt-0.5">AI • Signals • Backtesting • Education</div>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            <HeaderLink href="/docs" active={pathname?.startsWith('/docs')}>Docs</HeaderLink>
            <HeaderLink href="/pricing" active={pathname === '/pricing'}>Pricing</HeaderLink>
            <HeaderLink href="/about" active={pathname === '/about'}>About</HeaderLink>
            <HeaderLink href="/contact" active={pathname === '/contact'}>Contact</HeaderLink>
            {/* Example of a lightweight dropdown trigger (static) */}
            <div className="relative group">
              <HeaderLink href="#" active={false} aria-haspopup="true" aria-expanded="false">
                Solutions <ChevronDown className="ml-1 h-4 w-4 opacity-70" />
              </HeaderLink>
              <div className="pointer-events-none absolute left-0 mt-2 w-[320px] rounded-xl border border-white/10 bg-black/70 backdrop-blur p-2 opacity-0 shadow-2xl transition group-hover:opacity-100 group-hover:pointer-events-auto">
                <DropdownItem href="/solutions/hedge-funds" title="Hedge Funds" desc="Low‑latency infra & execution" />
                <DropdownItem href="/solutions/prop" title="Prop Trading" desc="Signal research & risk tooling" />
                <DropdownItem href="/solutions/education" title="Education" desc="Curriculum + sandbox + backtests" />
              </div>
            </div>
          </nav>

          {/* Desktop actions */}
          <div className="hidden lg:flex items-center gap-2">
            <Link href="/auth/signin" aria-label="Sign in">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link href="/auth/signup" aria-label="Sign up">
              <Button variant="ghost" size="sm">Sign up</Button>
            </Link>
            <Link href="/demo" aria-label="Live demo">
              <Button variant="ghost" size="sm">Demo</Button>
            </Link>
            <Link href="/pricing" aria-label="Start free trial">
              <Button size="sm" className="rounded-xl">
                Free Trial
              </Button>
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={toggle}
            className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-white/80 hover:bg-white/10"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <motion.div
        initial={false}
        animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="lg:hidden overflow-hidden"
      >
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
              <Button className="w-full rounded-xl">Free Trial</Button>
            </Link>
          </div>
        </div>
      </motion.div>
    </header>
  )
}

function HeaderLink({ href, children, active, ...rest }: { href: string; children: React.ReactNode; active?: boolean } & React.ComponentProps<typeof Link>) {
  return (
    <Link
      href={href}
      className={[
        'px-3 py-2 text-sm rounded-xl transition',
        active ? 'text-white bg-white/10' : 'text-white/80 hover:text-white hover:bg-white/10'
      ].join(' ')}
      {...rest}
    >
      {children}
    </Link>
  )
}

function MobileLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white/90 text-sm">
      {label}
    </Link>
  )
}

function DropdownItem({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} className="flex items-start gap-3 rounded-lg p-3 hover:bg-white/10">
      <div className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
      <div>
        <div className="text-sm font-medium text-white">{title}</div>
        <div className="text-xs text-white/70">{desc}</div>
      </div>
    </Link>
  )
}
