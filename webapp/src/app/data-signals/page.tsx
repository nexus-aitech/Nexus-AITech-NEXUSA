'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Activity, Wifi, WifiOff, RefreshCcw, Clock, ShieldCheck, LineChart as LcIcon, Waves, TrendingUp, TrendingDown } from 'lucide-react'

// Recharts (client‑only)
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false }) as any
const ComposedChart = dynamic(() => import('recharts').then(m => m.ComposedChart), { ssr: false }) as any
const Area = dynamic(() => import('recharts').then(m => m.Area), { ssr: false }) as any
const Line = dynamic(() => import('recharts').then(m => m.Line), { ssr: false }) as any
const Bar = dynamic(() => import('recharts').then(m => m.Bar), { ssr: false }) as any
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false }) as any
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false }) as any
const CartesianGrid = dynamic(() => import('recharts').then(m => m.CartesianGrid), { ssr: false }) as any
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false }) as any
const ReferenceLine = dynamic(() => import('recharts').then(m => m.ReferenceLine), { ssr: false }) as any

// Types
export type Tick = { t: number; o: number; h: number; l: number; c: number; v?: number }
export type Indicators = {
  adx?: number
  atr?: number
  ichimoku?: { spanA?: number; spanB?: number; base?: number; conv?: number; lag?: number }
  obv?: number
  stoch_rsi?: { k?: number; d?: number }
  vwap?: number
}
export type SignalRow = { t: number; type: 'LONG' | 'SHORT' | 'NEUTRAL'; reason: string }

type WsStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '' // prefer proxy via next.config.js rewrites
const WS_BASE = process.env.NEXT_PUBLIC_WS_BASE_URL ?? ''

export default function DataSignalsPage() {
  const sp = useSearchParams()
  const [symbol, setSymbol] = useState(sp.get('symbol') ?? 'BTCUSDT')
  const [tf, setTf] = useState(sp.get('tf') ?? '1h')
  const [limit, setLimit] = useState(300)

  const [ticks, setTicks] = useState<Tick[]>([])
  const [ind, setInd] = useState<Indicators | null>(null)
  const [signals, setSignals] = useState<SignalRow[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [wsStatus, setWsStatus] = useState<WsStatus>('idle')

  const wsRef = useRef<WebSocket | null>(null)
  const mounted = useRef(false)

  // ===== Fetch bootstrap (HTTP) =====
  const bootstrap = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const url = `${API_BASE || ''}/api/signals?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}&limit=${limit}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      // allow both shapes: {ticks, indicators, rows} or flat arrays
      const t: Tick[] = data.ticks ?? data?.candles ?? []
      const rows: SignalRow[] = data.rows ?? data?.signals ?? []
      const indicators: Indicators | null = data.indicators ?? null
      setTicks(t.slice(-limit))
      setSignals(rows.slice(-200))
      setInd(indicators)
    } catch (e: any) {
      setError(e?.message || 'Failed to load initial data.')
    } finally {
      setLoading(false)
    }
  }, [symbol, tf, limit])

  // ===== Live WS (optional) =====
  const connectWS = useCallback(() => {
    if (!WS_BASE) return // running behind HTTP only
    try {
      setWsStatus('connecting')
      const ws = new WebSocket(`${WS_BASE}/ws/stream?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}`)
      wsRef.current = ws
      ws.onopen = () => setWsStatus('open')
      ws.onclose = () => setWsStatus('closed')
      ws.onerror = () => setWsStatus('error')
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === 'tick') {
            setTicks(prev => {
              const next = [...prev, msg.payload as Tick]
              return next.slice(-Math.max(limit, 300))
            })
          }
          if (msg.type === 'indicator') {
            setInd((prev) => ({ ...prev, ...(msg.payload as Indicators) }))
          }
          if (msg.type === 'signal') {
            setSignals(prev => [{ t: Date.now(), type: msg.side, reason: msg.reason }, ...prev].slice(0, 200))
          }
        } catch {}
      }
    } catch {
      setWsStatus('error')
    }
  }, [symbol, tf, limit])

  useEffect(() => {
    mounted.current = true
    bootstrap().then(() => connectWS())
    return () => { mounted.current = false; wsRef.current?.close() }
  }, [bootstrap, connectWS])

  // ===== Derived metrics for KPI cards =====
  const last = ticks.at(-1)
  const price = last?.c ?? null
  const ichimokuBias = useMemo(() => {
    if (!ind?.ichimoku || !price) return 'NEUTRAL'
    const aboveKumo = price > Math.max(ind.ichimoku.spanA ?? -Infinity, ind.ichimoku.spanB ?? -Infinity)
    const belowKumo = price < Math.min(ind.ichimoku.spanA ?? Infinity, ind.ichimoku.spanB ?? -Infinity)
    if (aboveKumo) return 'BULL'
    if (belowKumo) return 'BEAR'
    return 'NEUTRAL'
  }, [ind, price])

  const vwapBias = useMemo(() => {
    if (!ind?.vwap || !price) return '—'
    return price >= ind.vwap ? 'Above VWAP' : 'Below VWAP'
  }, [ind, price])

  const adxStrength = useMemo(() => {
    const a = ind?.adx ?? null
    if (!a && a !== 0) return '—'
    if (a < 20) return 'Weak'
    if (a < 40) return 'Moderate'
    return 'Strong'
  }, [ind?.adx])

  // chart data unify
  const chartData = useMemo(() => ticks.map(t => ({
    time: new Date(t.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    c: t.c, h: t.h, l: t.l, v: t.v ?? 0,
    spanA: ind?.ichimoku?.spanA, spanB: ind?.ichimoku?.spanB,
    vwap: ind?.vwap,
  })), [ticks, ind])

  // ===== Render =====
  return (
    <main className="min-h-[100svh] bg-[#0a1a2f] text-black" aria-labelledby="title">
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="inline-flex items-center gap-1"><Activity className="h-3.5 w-3.5"/> Live</Badge>
          <Badge variant="secondary" className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5"/> Secure</Badge>
          <Badge variant="secondary" className="inline-flex items-center gap-1"><LcIcon className="h-3.5 w-3.5"/> Signals</Badge>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <h1 id="title" className="text-2xl md:text-3xl font-black tracking-tight">Data & Signals</h1>
          <span className="text-white/60">— {symbol} • {tf}</span>
          <div className="ml-auto flex items-center gap-2 text-white/70">
            {WS_BASE ? (
              wsStatus === 'open' ? <><Wifi className="h-4 w-4 text-emerald-400"/><span className="text-sm">WS connected</span></>
              : wsStatus === 'connecting' ? <><RefreshCcw className="h-4 w-4 animate-spin"/><span className="text-sm">Connecting…</span></>
              : wsStatus === 'error' ? <><WifiOff className="h-4 w-4 text-red-400"/><span className="text-sm">WS error</span></> : <><WifiOff className="h-4 w-4"/><span className="text-sm">WS closed</span></>
            ) : <><Clock className="h-4 w-4"/><span className="text-sm">HTTP polling</span></>}
          </div>
        </div>

        {/* Controls */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <Label htmlFor="symbol">Symbol</Label>
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger id="symbol"><SelectValue placeholder="Symbol"/></SelectTrigger>
              <SelectContent>
                {['BTCUSDT', 'PAXGUSDT', 'ETHUSDT','BNBUSDT', 'XRPUSDT', 'SOLUSDT', 'NEARUSDT',
'APTUSDT', 'ICPUSDT', 'AAVEUSDT', 'RNDERUSDT', 'TAOUSDT', 'VETUSDT',
'FETUSDT', 'ALGOUSDT', 'ARBUSDT', 'FILUSDT', 'ENAUSDT', 'ATOMUSDT',
'TIAUSDT', 'GRTUSDT', 'TONUSDT', 'OPUSDT', 'WIFUSDT', 'FLOKIUSDT'].map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="tf">Timeframe</Label>
            <Select value={tf} onValueChange={setTf}>
              <SelectTrigger id="tf"><SelectValue placeholder="TF"/></SelectTrigger>
              <SelectContent>
                {['5m','15m','30m','1h','2h','4h','6h','8h','12h','1d'].map(f => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="limit">History bars</Label>
            <Input id="limit" type="number" min={50} max={1000} value={limit} onChange={(e)=>setLimit(Math.max(50, Math.min(1000, Number(e.target.value)||300)))} />
          </div>
          <div className="flex items-end">
            <Button onClick={bootstrap} className="w-full"><RefreshCcw className="mr-2 h-4 w-4"/>Refresh</Button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPI title="Price" value={price ? fmt(price) : '—'} desc={vwapBias} icon={<Waves className="h-4 w-4"/>} />
          <KPI title="ADX" value={fmt(ind?.adx)} desc={adxStrength} icon={ind?.adx && ind.adx>=25 ? <TrendingUp className="h-4 w-4"/> : <TrendingDown className="h-4 w-4"/>} />
          <KPI title="ATR" value={fmt(ind?.atr)} desc="Volatility" icon={<Activity className="h-4 w-4"/>} />
          <KPI title="OBV" value={fmt(ind?.obv)} desc={Number(ind?.obv||0) >= 0 ? 'Accumulation' : 'Distribution'} icon={<LcIcon className="h-4 w-4"/>} />
        </div>

        {/* Main chart */}
        <Card className="mt-6 border-white/10 bg-white/5">
          <CardHeader className="pb-2"><CardTitle className="text-base">{symbol} — {tf} • Price, Ichimoku, VWAP & Volume</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[360px]">
              <ResponsiveContainer>
                <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="time" hide={false} tick={{ fill: 'rgba(255,255,255,.6)', fontSize: 12 }} />
                  <YAxis yAxisId="price" orientation="right" tick={{ fill: 'rgba(255,255,255,.6)', fontSize: 12 }} domain={[dataMin => Math.floor(dataMin*0.995), dataMax => Math.ceil(dataMax*1.005)]} />
                  <YAxis yAxisId="vol" orientation="left" hide domain={[0, 'dataMax']} />
                  <Tooltip contentStyle={{ background: 'rgba(0,0,0,.85)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12 }} labelStyle={{ color: 'white' }} />

                  {/* Ichimoku cloud as area band */}
                  <Area yAxisId="price" type="monotone" dataKey="spanA" strokeOpacity={0} fill="#34d399" fillOpacity={0.15} isAnimationActive={false} />
                  <Area yAxisId="price" type="monotone" dataKey="spanB" strokeOpacity={0} fill="#ef4444" fillOpacity={0.15} isAnimationActive={false} />

                  {/* Price line & VWAP */}
                  <Line yAxisId="price" type="monotone" dataKey="c" dot={false} strokeWidth={2} isAnimationActive={false} />
                  <Line yAxisId="price" type="monotone" dataKey="vwap" strokeDasharray="5 5" dot={false} strokeWidth={1.5} isAnimationActive={false} />

                  {/* Volume */}
                  <Bar yAxisId="vol" dataKey="v" opacity={0.5} />

                  {/* Reference price */}
                  {price && <ReferenceLine yAxisId="price" y={price} stroke="rgba(255,255,255,.25)" strokeDasharray="4 4" />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* StochRSI mini chart */}
        <Card className="mt-3 border-white/10 bg-white/5">
          <CardHeader className="pb-2"><CardTitle className="text-base">Stochastic RSI</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[160px]">
              <ResponsiveContainer>
                <ComposedChart data={[{ k: ind?.stoch_rsi?.k ?? null, d: ind?.stoch_rsi?.d ?? null, t: 'now' }]} margin={{ top: 5, right: 20, bottom: 0, left: 0 }}>
                  <YAxis domain={[0,100]} tick={{ fill: 'rgba(255,255,255,.6)', fontSize: 12 }} />
                  <XAxis dataKey="t" tick={{ fill: 'rgba(255,255,255,.6)', fontSize: 12 }} />
                  <ReferenceLine y={80} stroke="rgba(255,255,255,.25)" strokeDasharray="3 3" />
                  <ReferenceLine y={20} stroke="rgba(255,255,255,.25)" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="k" dot={false} strokeWidth={2} isAnimationActive={false} />
                  <Line type="monotone" dataKey="d" dot={false} strokeWidth={1.5} strokeDasharray="5 5" isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Signals table */}
        <Card className="mt-6 border-white/10 bg-white/5">
          <CardHeader className="pb-2"><CardTitle className="text-base">Latest Signals</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {signals.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-white/60 py-8">No signals yet.</TableCell>
                  </TableRow>
                )}
                {signals.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-white/70">{new Date(s.t).toLocaleString()}</TableCell>
                    <TableCell>
                      <span className={[
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs',
                        s.type==='LONG' ? 'border-emerald-400/30 text-emerald-300' : s.type==='SHORT' ? 'border-red-400/30 text-red-300' : 'border-white/20 text-white/70'
                      ].join(' ')}>{s.type}</span>
                    </TableCell>
                    <TableCell className="text-white/80">{s.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Error / Loading */}
        {error && (
          <Alert className="mt-4 border-red-500/30">
            <AlertDescription className="text-red-300">{error}</AlertDescription>
          </Alert>
        )}
        {loading && (
          <div className="mt-4 text-white/70">Loading…</div>
        )}

        <Separator className="my-6" />
        <div className="flex flex-wrap items-center gap-3 text-white/60 text-sm">
          <span>Env:</span>
          <code className="rounded bg-white/10 px-2 py-1">NEXT_PUBLIC_API_BASE_URL = {API_BASE || '(proxy /api)'} </code>
          <code className="rounded bg-white/10 px-2 py-1">NEXT_PUBLIC_WS_BASE_URL = {WS_BASE || '—'} </code>
          <span className="ml-auto">Need help? <Link href="/docs" className="underline">Docs</Link></span>
        </div>
      </section>
    </main>
  )
}

function KPI({ title, value, desc, icon }: { title: string; value: string; desc?: string; icon?: React.ReactNode }) {
  return (
    <Card className="border-white/10 bg-white/5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-white/60">{title}</div>
            <div className="text-2xl font-extrabold text-white">{value}</div>
            {desc && <div className="text-xs text-white/60 mt-1">{desc}</div>}
          </div>
          <div className="opacity-80">{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function fmt(n?: number | null) {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  return Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(n)
}
