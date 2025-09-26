'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Script from 'next/script'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Eye, EyeOff, Github, Chrome, Mail, Lock, ShieldCheck, Loader2, Info, KeyRound } from 'lucide-react'

/**
 * Global‑grade Sign‑In page designed to compete with top platforms
 * - Email/Password + OAuth + Magic Link + 2FA (TOTP) flows
 * - a11y‑first, keyboard friendly, reduced‑motion safe, semantic structure
 * - Clear error and success states, rate‑limit messaging, lockout hints
 * - Production wiring: hits /api/auth/signin, /api/auth/oauth/:provider, /api/auth/magiclink, /api/auth/totp/verify
 * - SEO structured data + security badges
 */
export default function SignInPage() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') || '/'

  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPwd, setShowPwd] = React.useState(false)
  const [remember, setRemember] = React.useState(true)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [info, setInfo] = React.useState<string | null>(null)
  const [requiresTOTP, setRequiresTOTP] = React.useState(false)
  const [totp, setTotp] = React.useState('')

  // Form validation (simple, client‑side)
  function validateBase() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'Enter a valid email address.'
    if (password.length < 8) return 'Password must be at least 8 characters.'
    return null
  }

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault()
    const v = validateBase()
    if (v) { setError(v); return }

    setLoading(true); setError(null); setInfo(null)
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, remember, next }),
      })

      if (res.status === 401) {
        const msg = await res.text()
        setError(msg || 'Invalid credentials.')
        return
      }
      if (res.status === 423) { // locked
        const msg = await res.text()
        setError(msg || 'Account locked due to too many attempts. Try later or reset password.')
        return
      }
      if (res.status === 202) { // requires TOTP
        setRequiresTOTP(true)
        setInfo('Two‑factor authentication required. Enter your 6‑digit code.')
        return
      }
      if (!res.ok) {
        throw new Error(await res.text())
      }

      // On success, backend should set cookie; then redirect
      router.replace(next)
    } catch (err: any) {
      setError(err?.message || 'Unexpected error, please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function verifyTOTP(e: React.FormEvent) {
    e.preventDefault()
    if (!/^\d{6}$/.test(totp)) { setError('Enter the 6‑digit code.'); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/auth/totp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: totp, next }),
      })
      if (!res.ok) throw new Error(await res.text())
      router.replace(next)
    } catch (err: any) {
      setError(err?.message || 'Invalid or expired code.')
    } finally {
      setLoading(false)
    }
  }

  function oauth(provider: 'google' | 'github') {
    // Server should initiate OAuth and handle callback → set cookie → redirect to `next`
    window.location.href = `/api/auth/oauth/${provider}?next=${encodeURIComponent(next)}`
  }

  async function magicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setError('Enter a valid email for the magic link.'); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/auth/magiclink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, next })
      })
      if (!res.ok) throw new Error(await res.text())
      setInfo('Check your inbox — we sent you a sign‑in link.')
    } catch (err: any) {
      setError(err?.message || 'Failed to send magic link.')
    } finally { setLoading(false) }
  }

  return (
    <main id="main" className="relative min-h-[100svh] bg-black text-white">
      {/* SEO structured data */}
      <Script id="signin-ld-json" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'NEXUSA',
        url: 'https://nexusa.ai/auth/signin',
        applicationCategory: 'FinancialApplication',
      }) }} />

      {/* Decorative gradient blurs */}
      <div aria-hidden className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full blur-3xl bg-gradient-to-tr from-emerald-400/20 via-sky-400/10 to-indigo-400/10" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full blur-3xl bg-gradient-to-tr from-indigo-400/10 via-fuchsia-400/10 to-emerald-400/20" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16 grid lg:grid-cols-2 gap-10 items-center">
        {/* Left: copy & trust */}
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.35 }}>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight">Welcome back</h1>
          <p className="mt-3 text-white/75 max-w-lg">Sign in to access real‑time signals, backtests, and your learning path. Secure by design: TLS‑only, signed cookies, role‑based access, audit trails.</p>
          <div className="mt-6 flex items-center gap-3 text-white/70">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-sm">OAuth • Argon2/Bcrypt • 2FA • Device fingerprint • Suspicious login alerts</span>
          </div>

          <dl className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-6">
            <KPI value="99.99%" label="Uptime SLO" />
            <KPI value="<100ms" label="Auth latency (p95)" />
            <KPI value="SOC‑ready" label="Controls" />
          </dl>
        </motion.div>

        {/* Right: auth card */}
        <motion.div initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}>
          <Card className="border-white/10 bg-white/5 backdrop-blur">
            <CardHeader>
              <CardTitle>Sign in</CardTitle>
              <CardDescription>Use your account email and password, or continue with a provider.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertTitle>Authentication failed</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {info && (
                <Alert>
                  <AlertTitle>Heads up</AlertTitle>
                  <AlertDescription>{info}</AlertDescription>
                </Alert>
              )}

              {/* OAuth */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button variant="secondary" onClick={() => oauth('google')} disabled={loading} aria-label="Continue with Google">
                  <Chrome className="mr-2 h-4 w-4" /> Continue with Google
                </Button>
                <Button variant="secondary" onClick={() => oauth('github')} disabled={loading} aria-label="Continue with GitHub">
                  <Github className="mr-2 h-4 w-4" /> Continue with GitHub
                </Button>
              </div>

              <Separator />

              {/* Email/password */}
              {!requiresTOTP ? (
                <form onSubmit={handlePasswordSignIn} className="space-y-4" noValidate>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <div className="relative mt-1">
                      <Mail className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60" />
                      <Input id="email" type="email" inputMode="email" autoComplete="email" placeholder="you@company.com" className="pl-8" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="password">Password</Label>
                    <div className="relative mt-1">
                      <Lock className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60" />
                      <Input id="password" type={showPwd ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" className="pl-8 pr-10" value={password} onChange={(e) => setPassword(e.target.value)} />
                      <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/70 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/30" aria-label={showPwd ? 'Hide password' : 'Show password'}>
                        {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch id="remember" checked={remember} onCheckedChange={setRemember} />
                      <Label htmlFor="remember" className="cursor-pointer">Keep me signed in</Label>
                    </div>
                    <Link href={`/auth/forgot?email=${encodeURIComponent(email)}`} className="text-sm underline text-white/80 hover:text-white">Forgot password?</Link>
                  </div>

                  <Button type="submit" disabled={loading} className="w-full inline-flex items-center justify-center">
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Sign in
                  </Button>

                  <div className="text-xs text-white/60 flex items-center gap-2">
                    <KeyRound className="h-3.5 w-3.5" />
                    <span>We hash passwords with Argon2/Bcrypt. New devices may require 2FA.</span>
                  </div>

                  {/* Magic link */}
                  <div className="pt-2 text-sm">
                    <button onClick={magicLink} className="underline text-white/80 hover:text-white" aria-label="Send magic link to email">Or send me a magic link</button>
                  </div>
                </form>
              ) : (
                <form onSubmit={verifyTOTP} className="space-y-4">
                  <div>
                    <Label htmlFor="totp">2FA code</Label>
                    <Input id="totp" inputMode="numeric" pattern="\\d{6}" placeholder="123 456" value={totp} onChange={(e) => setTotp(e.target.value.replace(/[^0-9]/g, '').slice(0,6))} />
                    <p className="mt-1 text-xs text-white/60">Open your authenticator app (Google Authenticator, 1Password, etc.).</p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={loading} className="flex-1">Verify</Button>
                    <Button type="button" variant="ghost" onClick={() => setRequiresTOTP(false)} className="flex-1">Back</Button>
                  </div>
                </form>
              )}

              <Separator />

              <p className="text-sm text-white/70">New to NEXUSA? <Link href={`/signup?plan=trial&email=${encodeURIComponent(email)}`} className="underline">Start your 48h free trial</Link></p>
            </CardContent>
          </Card>

          {/* small footnote */}
          <div className="mt-4 flex items-center gap-2 text-xs text-white/60">
            <Info className="h-4 w-4" />
            <span>By signing in, you agree to our <Link href="/legal/terms" className="underline">Terms</Link> and <Link href="/legal/privacy" className="underline">Privacy Policy</Link>.</span>
          </div>
        </motion.div>
      </div>
    </main>
  )
}

function KPI({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-extrabold text-emerald-400">{value}</div>
      <div className="text-xs text-white/60">{label}</div>
    </div>
  )
}
