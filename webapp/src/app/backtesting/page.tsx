"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import {
  Play,
  Square,
  RefreshCcw,
  Download,
  Settings2,
  Info,
  LineChart as LineChartIcon,
  BarChart3,
  Gauge,
  FileText,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";

// ==== Charts (client only)
const Recharts = {
  ResponsiveContainer: dynamic(() => import("recharts").then(m => m.ResponsiveContainer as any), { ssr: false }) as any,
  LineChart: dynamic(() => import("recharts").then(m => m.LineChart as any), { ssr: false }) as any,
  Line: dynamic(() => import("recharts").then(m => m.Line as any), { ssr: false }) as any,
  AreaChart: dynamic(() => import("recharts").then(m => m.AreaChart as any), { ssr: false }) as any,
  Area: dynamic(() => import("recharts").then(m => m.Area as any), { ssr: false }) as any,
  CartesianGrid: dynamic(() => import("recharts").then(m => m.CartesianGrid as any), { ssr: false }) as any,
  XAxis: dynamic(() => import("recharts").then(m => m.XAxis as any), { ssr: false }) as any,
  YAxis: dynamic(() => import("recharts").then(m => m.YAxis as any), { ssr: false }) as any,
  Tooltip: dynamic(() => import("recharts").then(m => m.Tooltip as any), { ssr: false }) as any,
  Legend: dynamic(() => import("recharts").then(m => m.Legend as any), { ssr: false }) as any,
};

// ==== Constants
const INDICATORS = ["ADX","ATR","Ichimoku","OBV","Stochastic RSI","VWAP","EMA","MACD"] as const;
const TIMEFRAMES = ["5m","15m","30m","1h","2h","4h","6h","8h","12h","1d"] as const;
const SYMBOLS = [
  "BTCUSDT","ETHUSDT","BNBUSDT","XRPUSDT","SOLUSDT","NEARUSDT","APTUSDT","ICPUSDT","AAVEUSDT","RNDERUSDT","TAOUSDT","VETUSDT","FETUSDT","ALGOUSDT","ARBUSDT","FILUSDT","ENAUSDT","ATOMUSDT","TIAUSDT","GRTUSDT","TONUSDT","OPUSDT","WIFUSDT","FLOKIUSDT","PAXGUSDT",
] as const;

// ==== Types
type KPI = {
  sharpe?: number;
  sortino?: number;
  cagr?: number;
  maxdd?: number; // negative percentage
  winRate?: number; // 0..1
  profitFactor?: number;
};

export type Trade = {
  id: string;
  entryAt: number; // epoch ms
  exitAt: number; // epoch ms
  symbol: string;
  side: "long" | "short";
  pl: number; // absolute
  plPct: number; // percent
  durationMin: number;
};

// ==== Mock helpers (remove when wiring API)
function mockKpi(): KPI {
  return { sharpe: 1.72, sortino: 2.31, cagr: 0.38, maxdd: -0.21, winRate: 0.63, profitFactor: 1.74 };
}
function mockEquity(n = 240): { t: number; equity: number; bench: number; dd: number }[] {
  const out: any[] = []; let e = 10000, b = 10000, dd = 0, peak = 10000;
  for (let i=0;i<n;i++){ const r = (Math.random()-0.45)*0.01; const rb=(Math.random()-0.5)*0.006; e*=1+r; b*=1+rb; peak = Math.max(peak,e); dd = (e-peak)/peak; out.push({ t: i, equity: Math.round(e), bench: Math.round(b), dd: dd}); }
  return out;
}
function mockTrades(n=120): Trade[] {
  return Array.from({length:n}).map((_,i)=>({
    id: `T${i}`,
    entryAt: Date.now()- (n-i)*36e5,
    exitAt: Date.now()- (n-i-0.5)*36e5,
    symbol: SYMBOLS[i % SYMBOLS.length],
    side: Math.random()>0.5?"long":"short",
    pl: (Math.random()-0.48)*120,
    plPct: (Math.random()-0.48)*0.03,
    durationMin: 30 + Math.round(Math.random()*300),
  }));
}

// ==== Backtest runner hook (EventSource/WebSocket/SSE ready)
function useBacktestRunner(){
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [kpi, setKpi] = useState<KPI | null>(null);
  const [equity, setEquity] = useState(mockEquity());
  const [trades, setTrades] = useState<Trade[]>(mockTrades());
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async (payload: any) => {
    setError(null); setRunning(true); setProgress(2);
    // TODO: POST to your API (streaming preferred)
    // const res = await fetch(process.env.NEXT_PUBLIC_BACKTEST_URL!, { method:"POST", body: JSON.stringify(payload)});
    // Stream progress via SSE or WebSocket; here we simulate
    let p=2; const timer = setInterval(()=>{
      p = Math.min(100, p + Math.random()*8);
      setProgress(p);
      if (p>98){ clearInterval(timer); setRunning(false); setProgress(100); setKpi(mockKpi()); setEquity(mockEquity()); setTrades(mockTrades()); }
    }, 500);
  },[]);

  const stop = useCallback(()=>{ setRunning(false); /* TODO: abort controller to backend */ },[]);
  const reset = useCallback(()=>{ setProgress(0); setKpi(null); setEquity(mockEquity()); setTrades(mockTrades()); setError(null); },[]);

  return { running, progress, kpi, equity, trades, error, start, stop, reset };
}

// ==== KPI Card
function MetricCard({ label, value, hint, format = "number" as "number"|"percent", danger = false }: { label: string; value: number | undefined; hint?: string; format?: "number"|"percent"; danger?: boolean; }){
  const display = useMemo(()=>{
    if (value==null) return "—";
    if (format==="percent") return (value*100).toFixed(1)+"%";
    return value.toFixed(2);
  },[value, format]);
  return (
    <Card className="glass">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <TooltipProvider><Tooltip><TooltipTrigger asChild><span className="inline-flex items-center gap-1"><Info className="h-3.5 w-3.5"/>{label}</span></TooltipTrigger><TooltipContent><p className="max-w-xs text-[11px] leading-5">{hint ?? label}</p></TooltipContent></Tooltip></TooltipProvider>
        </div>
        <div className={`mt-1 text-2xl font-bold ${danger ? "text-rose-400" : "text-emerald-400"}`}>{display}</div>
      </CardContent>
    </Card>
  );
}

// ==== Export helpers (client-side CSV/PDF)
function exportCSV(kpi: KPI | null, trades: Trade[]){
  const rows = [
    ["metric","value"],
    ["sharpe", kpi?.sharpe ?? ""],
    ["sortino", kpi?.sortino ?? ""],
    ["cagr", kpi?.cagr ?? ""],
    ["maxdd", kpi?.maxdd ?? ""],
    ["winRate", kpi?.winRate ?? ""],
    ["profitFactor", kpi?.profitFactor ?? ""],
    [],
    ["id","entryAt","exitAt","symbol","side","pl","plPct","durationMin"],
    ...trades.map(t=>[t.id, new Date(t.entryAt).toISOString(), new Date(t.exitAt).toISOString(), t.symbol, t.side, t.pl, t.plPct, t.durationMin])
  ];
  const csv = rows.map(r=>r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "backtest.csv"; a.click(); URL.revokeObjectURL(url);
}

async function exportPDF(){
  // Lightweight client-side print-to-PDF using the browser dialog (users can Save as PDF)
  // For server-quality PDFs, render a dedicated /api/export/pdf.
  window.print();
}

export default function BacktestingPage(){
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>(["ADX","ATR","Ichimoku"]);
  const [timeframe, setTimeframe] = useState<string>("1h");
  const [symbol, setSymbol] = useState<string>("BTCUSDT");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [initial, setInitial] = useState<string>("10000");
  const [leverage, setLeverage] = useState<string>("1");
  const [includeFees, setIncludeFees] = useState<boolean>(true);

  const { running, progress, kpi, equity, trades, error, start, stop, reset } = useBacktestRunner();

  const payload = useMemo(()=>({
    symbol, timeframe, indicators: selectedIndicators, from, to, initial: Number(initial), leverage: Number(leverage), includeFees
  }),[symbol,timeframe,selectedIndicators,from,to,initial,leverage,includeFees]);

  const onRun = useCallback(()=> start(payload), [start, payload]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container-responsive py-10">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="mb-8">
          <Badge variant="secondary" className="flex w-fit items-center gap-2 mb-2"><LineChartIcon className="h-4 w-4"/>Backtesting</Badge>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight">Strategy Backtesting</h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">Institutional‑grade backtests with realtime metrics, benchmark comparison, drawdown analytics and export‑ready reports.</p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Form Panel */}
          <section className="lg:col-span-4">
            <Card className="glass">
              <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5"/>Strategy Builder</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {/* Symbol */}
                <div className="space-y-1">
                  <Label>Symbol</Label>
                  <Select value={symbol} onValueChange={setSymbol}>
                    <SelectTrigger><SelectValue placeholder="Select symbol"/></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {SYMBOLS.map(s=> (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Timeframe */}
                <div className="space-y-1">
                  <Label>Timeframe</Label>
                  <Select value={timeframe} onValueChange={setTimeframe}>
                    <SelectTrigger><SelectValue placeholder="Select timeframe"/></SelectTrigger>
                    <SelectContent>
                      {TIMEFRAMES.map(tf=> (<SelectItem key={tf} value={tf}>{tf}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Indicators multi-select (chips) */}
                <div className="space-y-1">
                  <Label>Indicators</Label>
                  <div className="flex flex-wrap gap-2">
                    {INDICATORS.map(ind => {
                      const active = selectedIndicators.includes(ind);
                      return (
                        <button
                          key={ind}
                          onClick={()=> setSelectedIndicators(prev => active ? prev.filter(x=>x!==ind) : [...prev, ind])}
                          className={`px-2.5 py-1 rounded-full text-xs border transition ${active ? "bg-emerald-500/15 border-emerald-400/40 text-emerald-200" : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"}`}
                          type="button"
                          aria-pressed={active}
                        >{ind}</button>
                      );
                    })}
                  </div>
                </div>

                <Separator/>
                {/* Dates & capital */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>From</Label><Input type="date" value={from} onChange={e=>setFrom(e.target.value)} /></div>
                  <div className="space-y-1"><Label>To</Label><Input type="date" value={to} onChange={e=>setTo(e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Initial Balance (USDT)</Label><Input inputMode="numeric" value={initial} onChange={e=>setInitial(e.target.value)} /></div>
                  <div className="space-y-1"><Label>Leverage</Label><Input inputMode="numeric" value={leverage} onChange={e=>setLeverage(e.target.value)} /></div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Switch checked={includeFees} onCheckedChange={setIncludeFees}/><span className="text-sm text-muted-foreground">Include exchange fees</span></div>
                </div>

                <div className="flex gap-3 pt-2">
                  {!running ? (
                    <Button onClick={onRun} className="flex items-center gap-2"><Play className="h-4 w-4"/>Run Backtest</Button>
                  ):(
                    <Button onClick={stop} variant="destructive" className="flex items-center gap-2"><Square className="h-4 w-4"/>Stop</Button>
                  )}
                  <Button variant="secondary" onClick={reset} className="flex items-center gap-2"><RefreshCcw className="h-4 w-4"/>Reset</Button>
                </div>

                {running || progress>0 ? (
                  <div className="pt-2 space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Progress</span><span>{Math.round(progress)}%</span></div>
                    <Progress value={progress} />
                  </div>
                ): null}

                {error ? <p role="alert" className="text-sm text-rose-400">{error}</p> : null}
              </CardContent>
            </Card>
          </section>

          {/* Right: Results */}
          <section className="lg:col-span-8 space-y-6">
            {/* KPI Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <MetricCard label="Sharpe" value={kpi?.sharpe} hint="Risk‑adjusted return (annualized)"/>
              <MetricCard label="Sortino" value={kpi?.sortino} hint="Downside risk‑adjusted return"/>
              <MetricCard label="CAGR" value={kpi?.cagr} format="percent" hint="Compound annual growth rate"/>
              <MetricCard label="Max Drawdown" value={kpi?.maxdd} format="percent" danger hint="Worst peak‑to‑trough drop"/>
              <MetricCard label="Win rate" value={kpi?.winRate} format="percent" hint="Share of winning trades"/>
              <MetricCard label="Profit factor" value={kpi?.profitFactor} hint="Gross profit / gross loss"/>
            </div>

            {/* Charts */}
            <Card className="glass">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5"/>Analytics</CardTitle></CardHeader>
              <CardContent>
                <Tabs defaultValue="equity" className="w-full">
                  <TabsList className="mb-3">
                    <TabsTrigger value="equity">Equity Curve</TabsTrigger>
                    <TabsTrigger value="bench">Benchmark</TabsTrigger>
                    <TabsTrigger value="dd">Drawdown</TabsTrigger>
                  </TabsList>
                  <TabsContent value="equity">
                    <Recharts.ResponsiveContainer width="100%" height={300}>
                      <Recharts.LineChart data={equity}>
                        <Recharts.CartesianGrid strokeDasharray="3 3" />
                        <Recharts.XAxis dataKey="t"/>
                        <Recharts.YAxis/>
                        <Recharts.Tooltip/>
                        <Recharts.Legend/>
                        <Recharts.Line type="monotone" dataKey="equity" dot={false} />
                      </Recharts.LineChart>
                    </Recharts.ResponsiveContainer>
                  </TabsContent>
                  <TabsContent value="bench">
                    <Recharts.ResponsiveContainer width="100%" height={300}>
                      <Recharts.LineChart data={equity}>
                        <Recharts.CartesianGrid strokeDasharray="3 3" />
                        <Recharts.XAxis dataKey="t"/>
                        <Recharts.YAxis/>
                        <Recharts.Tooltip/>
                        <Recharts.Legend/>
                        <Recharts.Line type="monotone" dataKey="equity" name="Strategy" dot={false} />
                        <Recharts.Line type="monotone" dataKey="bench" name="Benchmark" dot={false} />
                      </Recharts.LineChart>
                    </Recharts.ResponsiveContainer>
                  </TabsContent>
                  <TabsContent value="dd">
                    <Recharts.ResponsiveContainer width="100%" height={220}>
                      <Recharts.AreaChart data={equity}>
                        <Recharts.CartesianGrid strokeDasharray="3 3" />
                        <Recharts.XAxis dataKey="t"/>
                        <Recharts.YAxis tickFormatter={(v:number)=> (v*100).toFixed(0)+"%"}/>
                        <Recharts.Tooltip formatter={(v:number)=> (v*100).toFixed(2)+"%" as any}/>
                        <Recharts.Area type="monotone" dataKey="dd" name="Drawdown" />
                      </Recharts.AreaChart>
                    </Recharts.ResponsiveContainer>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Trades table + Export */}
            <Card className="glass">
              <CardHeader className="pb-2 flex items-center justify-between">
                <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5"/>Trades</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={()=>exportCSV(kpi, trades)} className="gap-2"><Download className="h-4 w-4"/>CSV</Button>
                  <Button size="sm" onClick={()=>exportPDF()} className="gap-2"><Download className="h-4 w-4"/>PDF</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Entry</TableHead>
                        <TableHead>Exit</TableHead>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Side</TableHead>
                        <TableHead className="text-right">P/L</TableHead>
                        <TableHead className="text-right">% Gain</TableHead>
                        <TableHead className="text-right">Duration</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trades.map(t=> (
                        <TableRow key={t.id} className="text-sm">
                          <TableCell>{new Date(t.entryAt).toLocaleString()}</TableCell>
                          <TableCell>{new Date(t.exitAt).toLocaleString()}</TableCell>
                          <TableCell>{t.symbol}</TableCell>
                          <TableCell className={t.side==="long"?"text-emerald-300":"text-sky-300"}>{t.side}</TableCell>
                          <TableCell className={`text-right ${t.pl>=0?"text-emerald-400":"text-rose-400"}`}>{t.pl.toFixed(2)}</TableCell>
                          <TableCell className={`text-right ${t.plPct>=0?"text-emerald-400":"text-rose-400"}`}>{(t.plPct*100).toFixed(2)}%</TableCell>
                          <TableCell className="text-right">{t.durationMin}m</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </main>
  );
}
