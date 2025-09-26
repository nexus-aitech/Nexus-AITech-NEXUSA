"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Copy, Check, X, Globe, Wifi, WifiOff, Clock, Server, Link as LinkIcon, ShieldCheck, RefreshCcw, Download, TerminalSquare, KeyRound } from "lucide-react";

export const metadata = {
  title: "Diagnostics – NEXUSA",
  description: "Production-grade connectivity diagnostics for REST and WebSocket with latency, history, and export.",
};

type RestProbe = {
  ts: number;
  url: string;
  status: number | "ERR";
  latencyMs?: number;
  ok: boolean;
  sample?: any;
};

type WsEvent = {
  ts: number;
  type: "open" | "message" | "pong" | "error" | "close";
  note?: string;
  rtt?: number;
};

type WsState = "idle" | "connecting" | "open" | "error" | "closed";

export default function DiagnosticsPage() {
  // Defaults from env
  const defaultApi = (process.env.NEXT_PUBLIC_API_BASE as string) || "http://localhost:3001";
  const defaultWs = (process.env.NEXT_PUBLIC_WS_URL as string) || "ws://localhost:8080";

  // Inputs
  const [apiBase, setApiBase] = useState(defaultApi);
  const [wsUrl, setWsUrl] = useState(defaultWs);
  const [token, setToken] = useState<string>(""); // optional Bearer

  // REST state
  const [restStatus, setRestStatus] = useState<RestProbe | null>(null);
  const [history, setHistory] = useState<RestProbe[]>([]);
  const [probing, setProbing] = useState(false);

  // WS state
  const [wsState, setWsState] = useState<WsState>("idle");
  const [wsEvents, setWsEvents] = useState<WsEvent[]>([]);
  const [latency, setLatency] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pingTimer = useRef<NodeJS.Timeout | null>(null);
  const lastPing = useRef<number | null>(null);

  const authHeaders = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

  const copy = (text: string) => navigator.clipboard?.writeText(text);

  async function probeRest() {
    setProbing(true);
    try {
      const url = `${apiBase.replace(/\/$/, "")}/health`;
      const t0 = performance.now();
      const r = await fetch(url, { headers: { "Content-Type": "application/json", ...authHeaders } });
      const t1 = performance.now();
      let sample: any = null;
      try { sample = await r.clone().json(); } catch { sample = await r.text(); }
      const probe: RestProbe = { ts: Date.now(), url, status: r.status, ok: r.ok, latencyMs: Math.round(t1 - t0), sample };
      setRestStatus(probe);
      setHistory((h) => [probe, ...h].slice(0, 50));
    } catch {
      const probe: RestProbe = { ts: Date.now(), url: `${apiBase}/health`, status: "ERR", ok: false };
      setRestStatus(probe);
      setHistory((h) => [probe, ...h].slice(0, 50));
    } finally {
      setProbing(false);
    }
  }

  const connectWs = useCallback(() => {
    try {
      setWsEvents([]);
      setLatency(null);
      setWsState("connecting");
      const url = wsUrl.includes("?") ? `${wsUrl}&diag=1` : `${wsUrl}?diag=1`;
      const ws = new WebSocket(url, []);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsState("open");
        setWsEvents((e) => [{ ts: Date.now(), type: "open" }, ...e].slice(0, 100));
        // Kick off ping loop
        pingTimer.current && clearInterval(pingTimer.current);
        pingTimer.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            lastPing.current = performance.now();
            wsRef.current?.send(JSON.stringify({ op: "ping", t: Date.now() }));
          }
        }, 4000);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg?.op === "pong" && lastPing.current != null) {
            const rtt = performance.now() - lastPing.current;
            setLatency(Math.round(rtt));
            setWsEvents((e) => [{ ts: Date.now(), type: "pong", rtt: Math.round(rtt) }, ...e].slice(0, 100));
            return;
          }
          setWsEvents((e) => [{ ts: Date.now(), type: "message", note: truncate(String(ev.data)) }, ...e].slice(0, 100));
        } catch {
          setWsEvents((e) => [{ ts: Date.now(), type: "message", note: truncate(String(ev.data)) }, ...e].slice(0, 100));
        }
      };

      ws.onerror = () => {
        setWsState("error");
        setWsEvents((e) => [{ ts: Date.now(), type: "error", note: "WebSocket error" }, ...e].slice(0, 100));
      };

      ws.onclose = () => {
        setWsState("closed");
        setWsEvents((e) => [{ ts: Date.now(), type: "close", note: "Closed" }, ...e].slice(0, 100));
        pingTimer.current && clearInterval(pingTimer.current);
      };
    } catch {
      setWsState("error");
    }
  }, [wsUrl]);

  const disconnectWs = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    pingTimer.current && clearInterval(pingTimer.current);
    setWsState("closed");
  }, []);

  useEffect(() => () => { pingTimer.current && clearInterval(pingTimer.current); }, []);

  function exportHistory() {
    const rows = history.map((p) => ({
      ts: new Date(p.ts).toISOString(), url: p.url, status: p.status, ok: p.ok, latencyMs: p.latencyMs, sample: p.sample,
    }));
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "rest_diagnostics.json"; a.click(); URL.revokeObjectURL(url);
  }

  function truncate(s: string, n = 140) { return s.length > n ? s.slice(0, n) + "…" : s; }

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted px-4 py-8 text-white">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="mx-auto max-w-6xl">
        <Badge variant="secondary" className="mb-3">Diagnostics</Badge>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Connectivity & Health Checks</h1>
        <p className="mt-2 text-white/70 max-w-3xl">Probe REST and WebSocket endpoints with latency, live events, and exportable logs. Built for global launch readiness.</p>
      </motion.div>

      <div className="mx-auto max-w-6xl mt-8 grid gap-6 lg:grid-cols-3">
        {/* Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Server className="h-5 w-5"/> Targets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>REST API Base</Label>
              <div className="flex items-center gap-2">
                <Input value={apiBase} onChange={(e) => setApiBase(e.target.value)} placeholder="https://api.example.com" />
                <Button variant="secondary" size="sm" onClick={() => copy(apiBase)}><Copy className="h-4 w-4"/></Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>WebSocket URL</Label>
              <div className="flex items-center gap-2">
                <Input value={wsUrl} onChange={(e) => setWsUrl(e.target.value)} placeholder="wss://stream.example.com" />
                <Button variant="secondary" size="sm" onClick={() => copy(wsUrl)}><Copy className="h-4 w-4"/></Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Auth (Bearer token, optional)</Label>
              <div className="flex items-center gap-2">
                <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="sk_live_…" />
                <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="secondary" size="sm"><KeyRound className="h-4 w-4"/></Button></TooltipTrigger><TooltipContent>Used only in REST header Authorization</TooltipContent></Tooltip></TooltipProvider>
              </div>
            </div>

            <Separator />

            <div className="flex flex-wrap gap-2">
              <Button onClick={probeRest} disabled={probing}><RefreshCcw className="h-4 w-4 mr-1"/> Probe REST</Button>
              {wsState !== 'open' ? (
                <Button variant="secondary" onClick={connectWs}><LinkIcon className="h-4 w-4 mr-1"/> Connect WS</Button>
              ) : (
                <Button variant="secondary" onClick={disconnectWs}><WifiOff className="h-4 w-4 mr-1"/> Disconnect</Button>
              )}
              <Button variant="secondary" onClick={exportHistory}><Download className="h-4 w-4 mr-1"/> Export REST log</Button>
            </div>

            <div className="text-xs text-white/60 flex items-center gap-2"><ShieldCheck className="h-4 w-4"/> No secrets stored. Values remain in this session only.</div>
          </CardContent>
        </Card>

        {/* REST Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Globe className="h-5 w-5"/> REST Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div className="text-white/70 text-sm">{apiBase.replace(/\/$/, "")}/health</div>
                <Badge variant={restStatus?.ok ? "default" : "secondary"} className={restStatus ? (restStatus.ok ? "bg-emerald-500" : "bg-red-500") : ""}>
                  {restStatus ? (restStatus.ok ? "OK" : "FAIL") : "—"}
                </Badge>
              </div>
              <div className="mt-2 text-sm grid grid-cols-2 gap-2">
                <div>HTTP: <span className="font-mono">{restStatus?.status ?? "—"}</span></div>
                <div>Latency: <span className="font-mono">{restStatus?.latencyMs != null ? `${restStatus.latencyMs} ms` : "—"}</span></div>
              </div>
            </div>
            <div className="text-xs text-white/60">Sample response (truncated):</div>
            <pre className="max-h-40 overflow-auto rounded-lg border p-2 text-xs bg-black/40">{truncate(JSON.stringify(restStatus?.sample, null, 2) || "No data yet", 1200)}</pre>
          </CardContent>
        </Card>

        {/* WS Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Wifi className="h-5 w-5"/> WebSocket</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border p-3">
                <div className="text-white/60 text-sm">Status</div>
                <div className="mt-1 flex items-center gap-2">
                  {wsState === 'open' ? <Wifi className="h-4 w-4 text-emerald-400"/> : <WifiOff className="h-4 w-4 text-red-400"/>}
                  <span className="capitalize">{wsState}</span>
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-white/60 text-sm">Latency (ping → pong)</div>
                <div className="mt-1 font-mono">{latency != null ? `${latency} ms` : '—'}</div>
              </div>
            </div>

            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>RTT</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wsEvents.slice(0, 12).map((e, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{new Date(e.ts).toLocaleTimeString()}</TableCell>
                      <TableCell>{e.type}</TableCell>
                      <TableCell className="text-xs text-white/80">{e.note || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{e.rtt != null ? `${e.rtt} ms` : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* REST History */}
      <div className="mx-auto max-w-6xl mt-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><TerminalSquare className="h-5 w-5"/> REST Probes (history)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <div className="min-w-[720px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Latency</TableHead>
                    <TableHead>OK</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((p, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-xs">{new Date(p.ts).toLocaleTimeString()}</TableCell>
                      <TableCell className="text-xs">{p.url}</TableCell>
                      <TableCell className="font-mono text-xs">{String(p.status)}</TableCell>
                      <TableCell className="font-mono text-xs">{p.latencyMs != null ? `${p.latencyMs} ms` : '—'}</TableCell>
                      <TableCell>
                        {p.ok ? <Badge className="bg-emerald-500">OK</Badge> : <Badge className="bg-red-500">FAIL</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="mx-auto max-w-6xl mt-10 flex items-center justify-between text-sm text-white/70">
        <div className="flex items-center gap-2"><Clock className="h-4 w-4"/> Real‑time diagnostics</div>
        <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4"/> Ready for global launch</div>
      </div>
    </main>
  );
}
