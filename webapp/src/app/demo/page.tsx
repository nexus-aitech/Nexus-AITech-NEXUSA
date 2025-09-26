'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Copy, PlayCircle, Terminal, LineChart, Bot, ShieldCheck, Globe, Cpu, Link2 } from 'lucide-react'

/**
 * NEXUSA – Global‑grade Demo hub (app/demo)
 * - World‑class, production‑ready demo showcase page
 * - 4 demo modes: Video, Interactive Preview (iframe widget), AI Tutor sample, API quickstart
 * - a11y‑first, responsive, reduced‑motion safe, zero unknown components
 * - Safe placeholders that you can wire to real widgets later
 */
export default function DemoPage() {
  const [mode, setMode] = React.useState<'video' | 'preview' | 'tutor' | 'api'>('video')
  const [copied, setCopied] = React.useState(false)

  const curl = `curl -s "${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000'}/api/signals?symbol=BTCUSDT&tf=1h&limit=10" | jq '.'`

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }

  return (
    <main id="main" className="relative min-h-[100svh] bg-black text-white">
      {/* Decorative gradients */}
      <div aria-hidden className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full blur-3xl bg-gradient-to-tr from-emerald-400/20 via-sky-400/10 to-indigo-400/10" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full blur-3xl bg-gradient-to-tr from-indigo-400/10 via-fuchsia-400/10 to-emerald-400/20" />

      <section className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 pb-10">
        {/* Header / hero */}
        <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.35 }}>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary" className="inline-flex items-center gap-1"><Globe className="h-3.5 w-3.5"/> Global demo</Badge>
            <Badge variant="secondary" className="inline-flex items-center gap-1"><Cpu className="h-3.5 w-3.5"/> Realtime</Badge>
            <Badge variant="secondary" className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5"/> Secure</Badge>
          </div>
          <h1 className="mt-3 text-4xl md:text-5xl font-black tracking-tight">Explore NEXUSA</h1>
          <p className="mt-3 max-w-2xl text-white/75">See how live market data, ML signals, backtesting, and AI education come together. Start with a quick video, try the interactive preview, test the AI tutor, or hit the API.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <ModeButton active={mode==='video'} onClick={() => setMode('video')} icon={<PlayCircle className="h-4 w-4"/>}>Video</ModeButton>
            <ModeButton active={mode==='preview'} onClick={() => setMode('preview')} icon={<LineChart className="h-4 w-4"/>}>Interactive Preview</ModeButton>
            <ModeButton active={mode==='tutor'} onClick={() => setMode('tutor')} icon={<Bot className="h-4 w-4"/>}>AI Tutor</ModeButton>
            <ModeButton active={mode==='api'} onClick={() => setMode('api')} icon={<Terminal className="h-4 w-4"/>}>API</ModeButton>
          </div>
        </motion.div>

        {/* Main content card */}
        <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }} className="mt-8">
          <Card className="border-white/10 bg-white/5 backdrop-blur">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">{titleFor(mode)}</CardTitle>
            </CardHeader>
            <CardContent>
              {mode === 'video' && <VideoDemo />}
              {mode === 'preview' && <InteractivePreview />}
              {mode === 'tutor' && <TutorSample />}
              {mode === 'api' && <ApiQuickStart curl={curl} copied={copied} onCopy={() => copy(curl)} />}
            </CardContent>
          </Card>
        </motion.div>

        {/* Footer CTAs */}
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link href="/signup?plan=trial" aria-label="Start free trial">
            <Button size="lg" className="rounded-xl">Start 48h Free Trial</Button>
          </Link>
          <Link href="/docs" aria-label="Read documentation">
            <Button variant="ghost" size="lg" className="rounded-xl">Read Docs</Button>
          </Link>
          <Link href="/contact?topic=sales" aria-label="Contact sales">
            <Button variant="ghost" size="lg" className="rounded-xl inline-flex items-center gap-2"><Link2 className="h-4 w-4"/>Contact Sales</Button>
          </Link>
        </div>
      </section>
    </main>
  )
}

function titleFor(mode: 'video' | 'preview' | 'tutor' | 'api') {
  switch (mode) {
    case 'video': return 'Product tour (2 min)'
    case 'preview': return 'Interactive preview (read‑only)'
    case 'tutor': return 'AI Tutor sample'
    case 'api': return 'API quick start'
  }
}

function ModeButton({ active, onClick, icon, children }: { active?: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Button onClick={onClick} variant={active ? 'default' : 'secondary'} className="rounded-xl">
      <span className="inline-flex items-center gap-2">{icon}{children}</span>
    </Button>
  )
}

function VideoDemo() {
  return (
    <div>
      <div className="aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
        {/* Replace src with your hosted MP4/WebM or an embedded player */}
        <video controls preload="metadata" className="h-full w-full">
          <source src="/demo/nexusa-tour.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      </div>
      <p className="mt-3 text-sm text-white/70">A quick tour: platform overview, live data, signals, backtesting, and education. <Link href="/docs" className="underline">Learn more in docs</Link>.</p>
    </div>
  )
}

function InteractivePreview() {
  return (
    <div>
      {/* Device frame */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-black/60 to-black/40 p-3">
        <div className="rounded-xl border border-white/10 bg-black/60 overflow-hidden">
          {/* Safer than external embeds; replace src with your hosted widget */}
          <iframe title="NEXUSA Preview" src="/widgets/preview.html" className="h-[480px] w-full" loading="lazy" />
        </div>
      </div>
      <div className="mt-3 text-sm text-white/70">Read‑only dashboard preview with sample data refreshed periodically.</div>
    </div>
  )
}

function TutorSample() {
  const [messages, setMessages] = React.useState<Array<{role: 'user' | 'assistant'; content: string}>>([
    { role: 'assistant', content: 'Hi! I\'m your AI Tutor. Ask about BTCUSDT strategies, indicators, or backtests.' }
  ])
  const [text, setText] = React.useState('Explain Ichimoku basics for BTCUSDT 1h and when a long signal is valid.')

  async function send() {
    if (!text.trim()) return
    const next = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setText('')
    // Replace with your real endpoint
    const res = await fetch('/api/tutor/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next.slice(-6) }) })
    const data = res.ok ? await res.json() : { reply: 'Demo mode: In a valid Ichimoku long setup, price above Kumo, Tenkan > Kijun, and Chikou above price; confirm with volume and trend.' }
    setMessages(m => [...m, { role: 'assistant', content: data.reply }])
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="max-h-[420px] overflow-auto space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={m.role==='user' ? 'text-right' : 'text-left'}>
            <div className={[ 'inline-block rounded-2xl px-3 py-2 text-sm', m.role==='user' ? 'bg-emerald-500/10 border border-emerald-400/20' : 'bg-white/5 border border-white/10' ].join(' ')}>
              {m.content}
            </div>
          </div>
        ))}
      </div>
      <Separator className="my-3" />
      <div className="flex gap-2">
        <input value={text} onChange={e=>setText(e.target.value)} className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20" placeholder="Type your question…" />
        <Button onClick={send} className="rounded-xl">Send</Button>
      </div>
    </div>
  )
}

function ApiQuickStart({ curl, copied, onCopy }: { curl: string; copied: boolean; onCopy: () => void }) {
  return (
    <div>
      <Card className="border-white/10 bg-white/5">
        <CardHeader className="pb-2"><CardTitle className="text-base">Signals endpoint</CardTitle></CardHeader>
        <CardContent>
          <CodeBlock code={curl} onCopy={onCopy} copied={copied} />
          <p className="mt-3 text-sm text-white/70">Set <code className="rounded bg-white/10 px-1">NEXT_PUBLIC_API_BASE_URL</code> for production. For dev, ensure your FastAPI is running locally.</p>
        </CardContent>
      </Card>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Card className="border-white/10 bg-white/5"><CardHeader className="pb-2"><CardTitle className="text-base">Auth flow</CardTitle></CardHeader><CardContent className="text-sm text-white/70">Use OAuth (Google/GitHub) or email/password + 2FA. On success, a secure session cookie is issued.</CardContent></Card>
        <Card className="border-white/10 bg-white/5"><CardHeader className="pb-2"><CardTitle className="text-base">Rate limits</CardTitle></CardHeader><CardContent className="text-sm text-white/70">Per‑plan limits enforced. 429 returned when exceeded. Include <code className="rounded bg-white/10 px-1">Retry‑After</code> header.</CardContent></Card>
      </div>
    </div>
  )
}

function CodeBlock({ code, onCopy, copied }: { code: string; onCopy: () => void; copied: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/70 p-3 font-mono text-xs overflow-x-auto">
      <pre className="whitespace-pre-wrap break-words">{code}</pre>
      <div className="mt-2 flex items-center justify-between text-white/60">
        <span>Copy & run in your terminal</span>
        <Button size="sm" variant="secondary" onClick={onCopy} className="inline-flex items-center gap-2 rounded-lg">
          <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  )
}
