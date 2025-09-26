"use client";

// ==================================================================
// NEXUSA — Charts & Analytics (Pro)
// • Multi‑symbol compare (BTC/ETH/SOL/BNB/XRP)
// • Timeframe switch (5m → 1d)
// • Indicator overlays (EMA20/EMA50, VWAP mock)
// • Crosshair tooltip, Brush (zoom), pan via data window, legend toggle
// • RTL/LTR aware, glass cards, motion
// • API‑ready hooks for live data (SSE/WS) with refresh
// ==================================================================

import dynamic from "next/dynamic";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { TrendingUp, BarChart2, Activity, RefreshCcw } from "lucide-react";

// Recharts – dynamic to avoid SSR hiccups
const ResponsiveContainer = dynamic(() => import("recharts").then(m=>m.ResponsiveContainer), { ssr:false });
const LineChart = dynamic(() => import("recharts").then(m=>m.LineChart), { ssr:false });
const Line = dynamic(() => import("recharts").then(m=>m.Line), { ssr:false });
const AreaChart = dynamic(() => import("recharts").then(m=>m.AreaChart), { ssr:false });
const Area = dynamic(() => import("recharts").then(m=>m.Area), { ssr:false });
const XAxis = dynamic(() => import("recharts").then(m=>m.XAxis), { ssr:false });
const YAxis = dynamic(() => import("recharts").then(m=>m.YAxis), { ssr:false });
const CartesianGrid = dynamic(() => import("recharts").then(m=>m.CartesianGrid), { ssr:false });
const Tooltip = dynamic(() => import("recharts").then(m=>m.Tooltip), { ssr:false });
const Legend = dynamic(() => import("recharts").then(m=>m.Legend), { ssr:false });
const Brush = dynamic(() => import("recharts").then(m=>m.Brush), { ssr:false });

// ====== Config
const SYMBOLS = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT"] as const;
const TIMEFRAMES = ["5m","15m","30m","1h","2h","4h","12h","1d"] as const;

// ====== Helpers
type Point = { t: number; [k: string]: number };
function genSeries(seed=10000, n=400): Point[]{
  let x = seed; const out: Point[]=[]; for (let i=0;i<n;i++){ x *= 1 + (Math.random()-0.5)*0.01; out.push({ t:i, close: x}); } return out;
}
function emaSeries(src: Point[], period: number, key: string){
  const k = 2/(period+1); let e = src[0]?.close ?? 0; return src.map((d,i)=>{ if(i===0) e = d.close; else e = d.close*k + e*(1-k); return { ...d, [key]: e }; });
}
function vwapMock(src: Point[]): Point[]{
  let sumPV=0, sumV=0; return src.map((d,i)=>{ const v = 900 + Math.sin(i/5)*200 + i*5; sumPV += d.close*v; sumV += v; const vwap = sumPV/Math.max(1,sumV); return { ...d, vwap }; });
}

// ====== Live hook (mocked; replace with SSE/WS)
function useLive(symbol: string, tf: string){
  const [data, setData] = useState<Point[]>(()=> vwapMock(emaSeries(emaSeries(genSeries(),20,"ema20"),50,"ema50")));
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async()=>{
    setLoading(true);
    // TODO: fetch(`/api/charts?symbol=${symbol}&tf=${tf}`) streaming
    // simulate jitter update
    setTimeout(()=>{ setData(vwapMock(emaSeries(emaSeries(genSeries(),20,"ema20"),50,"ema50"))); setLoading(false); }, 450);
  },[symbol, tf]);
  useEffect(()=>{ refresh(); },[symbol, tf, refresh]);
  return { data, loading, refresh };
}

export default function ChartsPagePro(){
  const [symbols, setSymbols] = useState<string[]>(["BTCUSDT","ETHUSDT"]);
  const [tf, setTf] = useState<string>("1h");
  const [showEMA20, setShowEMA20] = useState(true);
  const [showEMA50, setShowEMA50] = useState(true);
  const [showVWAP, setShowVWAP] = useState(false);

  const { data, loading, refresh } = useLive(symbols[0], tf);

  // For compare view we just reuse same shape with slight offsets (mock)
  const data2 = useMemo(()=> data.map((d,i)=> ({ ...d, close2: d.close * (0.96 + (i%20)/2000) })), [data]);

  const dir: "rtl"|"ltr" = "rtl";

  return (
    <main dir={dir} className="min-h-[100dvh] bg-background text-foreground">
      <div className="container-responsive py-12">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="mb-6">
          <Badge variant="secondary" className="flex w-fit items-center gap-2 mb-3"><TrendingUp className="h-4 w-4"/> Charts & Analytics</Badge>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight">Charts & Analytics</h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">Multi‑symbol comparison, indicator overlays, and interactive zoom for live decision‑making.</p>
        </motion.div>

        {/* Controls */}
        <Card className="glass mb-6">
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground mb-1">Symbols</div>
              <div className="flex flex-wrap gap-2">
                {SYMBOLS.map(s => {
                  const active = symbols.includes(s);
                  return (
                    <button key={s} onClick={()=> setSymbols(prev => active ? prev.filter(x=>x!==s) : [...prev, s])} className={`px-2.5 py-1 rounded-full text-xs border transition ${active?"bg-emerald-500/15 border-emerald-400/40 text-emerald-200":"bg-white/5 border-white/10 text-white/70 hover:bg-white/10"}`}>{s}</button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground mb-1">Timeframe</div>
              <Select value={tf} onValueChange={setTf}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="TF"/></SelectTrigger>
                <SelectContent>{TIMEFRAMES.map(t=> <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm"><Switch checked={showEMA20} onCheckedChange={setShowEMA20}/> EMA 20</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={showEMA50} onCheckedChange={setShowEMA50}/> EMA 50</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={showVWAP} onCheckedChange={setShowVWAP}/> VWAP</label>
              <Button size="sm" onClick={refresh} className="ml-auto gap-2"><RefreshCcw className="h-4 w-4"/>{loading?"در حال بروزرسانی…":"Refresh"}</Button>
            </div>
          </CardContent>
        </Card>

        {/* Main Chart */}
        <Card className="glass">
          <CardHeader><CardTitle className="flex items-center gap-2"><BarChart2 className="h-5 w-5"/> Price Action</CardTitle></CardHeader>
          <CardContent className="p-4">
            <div className="h-[420px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="t" stroke="currentColor"/>
                  <YAxis stroke="currentColor" domain={["auto","auto"]}/>
                  <Tooltip formatter={(v:any, name:any)=> [typeof v==="number"? v.toFixed(2):v, name]}/>
                  <Legend/>
                  <Line type="monotone" dataKey="close" name={`${symbols[0]} Close`} dot={false} strokeWidth={2} />
                  {symbols.length>1 && <Line type="monotone" dataKey="close2" name={`${symbols[1]} Close`} dot={false} strokeWidth={1.6} />}
                  {showEMA20 && <Line type="monotone" dataKey="ema20" name="EMA20" dot={false} strokeWidth={1} />}
                  {showEMA50 && <Line type="monotone" dataKey="ema50" name="EMA50" dot={false} strokeWidth={1} />}
                  {showVWAP && <Line type="monotone" dataKey="vwap" name="VWAP" dot={false} strokeWidth={1} />}
                  <Brush travellerWidth={10} height={22}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Secondary: Drawdown (mock) */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="glass">
            <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5"/> Drawdown</CardTitle></CardHeader>
            <CardContent className="p-4">
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.map(d=> ({ t:d.t, dd: (d.close - Math.max(d.close, 10000))/Math.max(d.close,10000) }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="t" stroke="currentColor"/>
                    <YAxis tickFormatter={(v:number)=> (v*100).toFixed(0)+"%"} stroke="currentColor"/>
                    <Tooltip formatter={(v:any)=> (Number(v)*100).toFixed(2)+"%" as any}/>
                    <Area type="monotone" dataKey="dd" name="Drawdown" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="glass">
            <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5"/> Volatility (mock)</CardTitle></CardHeader>
            <CardContent className="p-4">
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.map((d,i)=> ({ t:d.t, vol: Math.abs(Math.sin(i/8))*0.03 }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="t" stroke="currentColor"/>
                    <YAxis tickFormatter={(v:number)=> (v*100).toFixed(1)+"%"} stroke="currentColor"/>
                    <Tooltip formatter={(v:any)=> (Number(v)*100).toFixed(2)+"%" as any}/>
                    <Area type="monotone" dataKey="vol" name="Volatility" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}