// ---------------------------------------------------------------
// components/LiveSignals.tsx — world‑class, production‑ready
// Transport cascade (WebTransport ➜ WebSocket ➜ SSE),
// Zod validation, exponential backoff + jitter, heartbeat,
// visibility‑aware pause/resume, dedupe, bounded buffer,
// accessible UI with status badges and filtering.
// ---------------------------------------------------------------
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { Wifi, WifiOff, RefreshCcw, Activity, TriangleAlert } from "lucide-react";

// ===== ENV (12‑factor) ======================================================
const WTT_URL = process.env.NEXT_PUBLIC_WT_URL as string | undefined; // e.g. https://api.nexusa.ai/wt
const WS_URL  = process.env.NEXT_PUBLIC_WS_URL  as string | undefined; // e.g. wss://api.nexusa.ai/ws/signals
const SSE_URL = process.env.NEXT_PUBLIC_SSE_URL as string | undefined; // e.g. https://api.nexusa.ai/sse/signals

// ===== Schemas ==============================================================
const SignalSchema = z.object({
  id: z.string().optional(),
  ts: z.number().int(),
  src: z.string().optional(),
  symbol: z.string(),
  tf: z.string(),
  side: z.enum(["LONG", "SHORT", "NEUTRAL"]).default("NEUTRAL"),
  price: z.number().optional(),
  reason: z.string().optional(),
  score: z.number().optional(), // model confidence 0..1 or -1..1
});
export type Signal = z.infer<typeof SignalSchema>;

const WireSchema = z.union([
  z.object({ op: z.literal("signal"), data: SignalSchema }),
  z.object({ op: z.literal("signals"), data: z.array(SignalSchema) }),
  z.object({ op: z.literal("ping"), t: z.number() }),
  z.object({ op: z.literal("error"), message: z.string() }),
]);

// ===== Component ============================================================
const MAX_BUFFER = 300;
const MAX_JITTER = 400; // ms

export default function LiveSignals() {
  const [items, setItems] = useState<Signal[]>([]);
  const [status, setStatus] = useState<"connecting" | "connected" | "reconnecting" | "offline" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);

  const [symbol, setSymbol] = useState<string>("BTCUSDT");
  const [tf, setTf] = useState<string>("1h");
  const [query, setQuery] = useState("");

  const backoffRef = useRef(1000);
  const ctrlRef = useRef<AbortController | null>(null);
  const hbRef = useRef<number | null>(null);
  const visibleRef = useRef<boolean>(true);
  const seenRef = useRef<string[]>([]); // dedupe by id+ts

  // Filtered list
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((s) =>
      (!symbol || s.symbol.toUpperCase() === symbol.toUpperCase()) &&
      (!tf || s.tf === tf) &&
      (!q || `${s.symbol} ${s.tf} ${s.side} ${s.reason ?? ""}`.toLowerCase().includes(q))
    );
  }, [items, query, symbol, tf]);

  const push = useCallback((sig: Signal) => {
    // dedupe: id? else composite key
    const key = `${sig.id ?? "_"}-${sig.ts}-${sig.symbol}-${sig.side}`;
    if (seenRef.current.includes(key)) return;
    seenRef.current.unshift(key);
    if (seenRef.current.length > MAX_BUFFER * 2) seenRef.current.length = MAX_BUFFER * 2;

    setItems((prev) => {
      const next = [sig, ...prev];
      if (next.length > MAX_BUFFER) next.length = MAX_BUFFER;
      return next;
    });
  }, []);

  const pushMany = useCallback((arr: Signal[]) => {
    for (const s of arr) push(s);
  }, [push]);

  const parseWire = (raw: unknown) => {
    const parsed = WireSchema.safeParse(raw);
    if (!parsed.success) return { op: "error", message: "Invalid payload" } as const;
    return parsed.data;
  };

  const cleanup = useCallback(() => {
    ctrlRef.current?.abort();
    ctrlRef.current = new AbortController();
    if (hbRef.current) { window.clearInterval(hbRef.current); hbRef.current = null; }
  }, []);

  const connect = useCallback(() => {
    let cancelled = false;
    cleanup();
    setError(null);

    const loop = async () => {
      try {
        setStatus((s) => (s === "connecting" ? s : "reconnecting"));

        // 1) WebTransport (QUIC datagrams) — optional
        if (WTT_URL && typeof (globalThis as any).WebTransport !== "undefined") {
          const url = `${WTT_URL}?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}`;
          const wt = new (globalThis as any).WebTransport(url);
          await wt.ready;
          backoffRef.current = 1000; setStatus("connected");
          const reader = wt.datagrams.readable.getReader();
          while (!cancelled) {
            const { value, done } = await reader.read(); if (done) break;
            try {
              const json = JSON.parse(new TextDecoder().decode(value));
              const wire = parseWire(json);
              if (wire.op === "signal") push(wire.data);
              if (wire.op === "signals") pushMany(wire.data);
            } catch {}
          }
          await wt.closed; throw new Error("wt-closed");
        }

        // 2) WebSocket
        if (WS_URL) {
          await new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(`${WS_URL}?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}`);
            const onAbort = () => ws.close();

            ws.onopen = () => {
              backoffRef.current = 1000; setStatus("connected"); resolve();
              // Heartbeat (adapt if your server expects JSON pings)
              hbRef.current = window.setInterval(() => { try { ws.send("ping"); } catch {} }, 25_000);
            };
            ws.onmessage = (e) => {
              try {
                const wire = parseWire(JSON.parse(e.data));
                if (wire.op === "signal") push(wire.data);
                if (wire.op === "signals") pushMany(wire.data);
              } catch {}
            };
            ws.onerror = () => { setStatus("error"); setError("WebSocket error"); };
            ws.onclose = () => { setStatus("reconnecting"); reject(new Error("ws-closed")); };
            ctrlRef.current!.signal.addEventListener("abort", onAbort, { once: true });
          });
        }

        // 3) SSE fallback
        if (SSE_URL) {
          await new Promise<void>((resolve, reject) => {
            const es = new EventSource(`${SSE_URL}?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}`);
            const onAbort = () => es.close();
            es.onopen = () => { backoffRef.current = 1000; setStatus("connected"); resolve(); };
            es.onmessage = (e) => {
              try {
                const wire = parseWire(JSON.parse(e.data));
                if (wire.op === "signal") push(wire.data);
                if (wire.op === "signals") pushMany(wire.data);
              } catch {}
            };
            es.onerror = () => { setStatus("reconnecting"); es.close(); reject(new Error("sse-error")); };
            ctrlRef.current!.signal.addEventListener("abort", onAbort, { once: true });
          });
        }

        throw new Error("no-transport");
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message ?? "connection-error");
        setStatus(navigator.onLine ? "reconnecting" : "offline");
        const jitter = Math.random() * MAX_JITTER;
        const delay = Math.min(30_000, backoffRef.current + jitter);
        await new Promise((r) => setTimeout(r, delay));
        backoffRef.current = Math.min(30_000, backoffRef.current * 1.8);
        if (visibleRef.current) loop();
      }
    };

    loop();

    const onVis = () => {
      visibleRef.current = document.visibilityState === "visible";
      if (visibleRef.current && status !== "connected") loop();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      cleanup();
    };
  }, [cleanup, push, pushMany, status, symbol, tf]);

  // Lifecycle
  useEffect(() => {
    return connect();
  }, [connect]);

  // UI helpers
  const fmtPrice = (n?: number) => n == null ? "—" : new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(n);
  const tsFmt = (n: number) => new Date(n).toLocaleString();

  return (
    <Card className="border-white/10 bg-white/[0.04]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">📡 Live Signals</CardTitle>
          <StatusBadge status={status} />
        </div>
      </CardHeader>
      <CardContent>
        {/* Controls */}
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-white/70">Symbol</label>
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Symbol"/></SelectTrigger>
              <SelectContent>
                {["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","ADAUSDT"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/70">Timeframe</label>
            <Select value={tf} onValueChange={setTf}>
              <SelectTrigger className="h-9"><SelectValue placeholder="TF"/></SelectTrigger>
              <SelectContent>
                {["1m","5m","15m","1h","4h","1d"].map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-white/70">Filter</label>
            <div className="flex items-center gap-2">
              <Input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search reason / side / symbol…" className="h-9"/>
              <Button variant="secondary" size="sm" onClick={()=>setQuery("")}>Clear</Button>
            </div>
          </div>
        </div>

        {error && (
          <Alert className="mb-3 border-rose-400/30 bg-rose-500/10">
            <TriangleAlert className="h-4 w-4" />
            <AlertDescription className="text-rose-200 text-sm">{error}</AlertDescription>
          </Alert>
        )}

        <ScrollArea className="h-[320px] pr-2">
          <ul className="text-sm space-y-1">
            {filtered.length === 0 && (
              <li className="text-white/60">No signals yet.</li>
            )}
            {filtered.map((s, i) => (
              <li key={`${s.id ?? "_"}-${s.ts}-${i}`} className="border-b border-white/10 pb-1">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border",
                    s.side === "LONG" ? "bg-emerald-500/10 text-emerald-300 border-emerald-400/30" :
                    s.side === "SHORT" ? "bg-rose-500/10 text-rose-300 border-rose-400/30" :
                    "bg-white/5 text-white/70 border-white/20"
                  )}>{s.side}</span>
                  <strong>{s.symbol}</strong>
                  <span className="text-white/60">· {s.tf}</span>
                  <span className="ml-auto text-xs text-white/70 tabular-nums">{fmtPrice(s.price)}</span>
                </div>
                {(s.reason || s.src || s.score != null) && (
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/70">
                    {s.reason && <span>{s.reason}</span>}
                    {s.src && <span className="rounded bg-white/10 px-1.5 py-0.5">{s.src}</span>}
                    {s.score != null && <span className="rounded bg-white/10 px-1.5 py-0.5">score: {s.score.toFixed?.(2)}</span>}
                    <span className="ml-auto">{tsFmt(s.ts)}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </ScrollArea>

        <div className="mt-3 flex items-center justify-between text-xs text-white/60">
          <div className="flex items-center gap-2">
            <span>Env:</span>
            <code className="rounded bg-white/10 px-2 py-0.5">WT: {WTT_URL ? "on" : "off"}</code>
            <code className="rounded bg-white/10 px-2 py-0.5">WS: {WS_URL ? "on" : "off"}</code>
            <code className="rounded bg-white/10 px-2 py-0.5">SSE: {SSE_URL ? "on" : "off"}</code>
          </div>
          <Button size="icon" variant="ghost" onClick={()=>{ setItems([]); seenRef.current=[]; }} title="Clear buffer">
            <RefreshCcw className="h-4 w-4"/>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: "connecting" | "connected" | "reconnecting" | "offline" | "error" }) {
  const map = {
    connecting: { icon: <RefreshCcw className="h-3.5 w-3.5 animate-spin"/>, label: "Connecting", cls: "border-amber-400/30 text-amber-300 bg-amber-500/10" },
    connected:  { icon: <Wifi className="h-3.5 w-3.5"/>,              label: "Connected",  cls: "border-emerald-400/30 text-emerald-300 bg-emerald-500/10" },
    reconnecting:{ icon:<RefreshCcw className="h-3.5 w-3.5 animate-spin"/>, label:"Reconnecting", cls:"border-sky-400/30 text-sky-300 bg-sky-500/10" },
    offline:    { icon: <WifiOff className="h-3.5 w-3.5"/>,             label: "Offline",    cls: "border-white/20 text-white/70 bg-white/[0.03]" },
    error:      { icon: <Activity className="h-3.5 w-3.5"/>,            label: "Error",      cls: "border-rose-400/30 text-rose-300 bg-rose-500/10" },
  } as const;
  const m = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs", m.cls)} aria-live="polite">
      {m.icon}<span>{m.label}</span>
    </span>
  );
}
