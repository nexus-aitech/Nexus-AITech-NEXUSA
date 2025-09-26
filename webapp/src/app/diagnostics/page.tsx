"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type Status = "ok" | "warn" | "error" | "loading";

interface CheckResult {
  name: string;
  status: Status;
  latency?: number;
  message?: string;
}

// --- Helper to render colored badges ---
const StatusBadge = ({ status }: { status: Status }) => {
  const color =
    status === "ok"
      ? "bg-green-600"
      : status === "warn"
      ? "bg-yellow-500"
      : status === "error"
      ? "bg-red-600"
      : "bg-zinc-500 animate-pulse";

  return (
    <Badge className={cn(color, "text-white font-semibold")}>
      {status.toUpperCase()}
    </Badge>
  );
};

export default function DiagnosticsPage() {
  const [results, setResults] = useState<CheckResult[]>([]);
  const [wsStatus, setWsStatus] = useState<Status>("loading");

  // ✅ کلاینت-ساید برای اطلاعات مرورگر
  const [clientInfo, setClientInfo] = useState<{
    userAgent?: string;
    buildTime?: string;
    memory?: string;
  }>({});

  useEffect(() => {
    setClientInfo({
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "N/A",
      buildTime: new Date().toISOString(),
      memory:
        typeof performance !== "undefined" && (performance as any).memory
          ? Math.round(
              (performance as any).memory.jsHeapSizeLimit / 1024 / 1024
            ) + " MB"
          : "N/A",
    });
  }, []);

  // Run health checks
  useEffect(() => {
    const runChecks = async () => {
      const checks: CheckResult[] = [];

      const apis = [
        { name: "Signals API", url: "/api/signals?symbol=BTCUSDT&tf=1h&limit=5" },
        { name: "Reports API", url: "/api/reports/generate?symbol=BTCUSDT&lang=en&range=daily" },
        { name: "Backtesting API", url: "/api/backtesting?symbol=BTCUSDT" },
      ];

      for (const api of apis) {
        const t0 = performance.now();
        try {
          const res = await fetch(api.url);
          const t1 = performance.now();
          checks.push({
            name: api.name,
            status: res.ok ? "ok" : "error",
            latency: Math.round(t1 - t0),
            message: res.ok ? "Healthy" : `Error ${res.status}`,
          });
        } catch (err: any) {
          checks.push({
            name: api.name,
            status: "error",
            message: err.message,
          });
        }
      }

      try {
        const res = await fetch("/api/diagnostics");
        checks.push({
          name: "DB/Cache",
          status: res.ok ? "ok" : "warn",
          message: res.ok ? "Connected" : "Unreachable",
        });
      } catch {
        checks.push({
          name: "DB/Cache",
          status: "warn",
          message: "API not implemented",
        });
      }

      setResults(checks);
    };

    runChecks();
  }, []);

  // WebSocket test
  useEffect(() => {
    const ws = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@trade");
    ws.onopen = () => setWsStatus("ok");
    ws.onerror = () => setWsStatus("error");
    ws.onclose = () => setWsStatus("warn");
    return () => ws.close();
  }, []);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <motion.h1
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-4xl font-bold tracking-tight"
      >
        ⚡ System Diagnostics
      </motion.h1>
      <Separator />

      {/* API Health Cards */}
      <div className="grid md:grid-cols-2 gap-4">
        {results.map((r, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card className="bg-zinc-900/80 border border-zinc-700 shadow-md hover:shadow-green-500/20 transition">
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  {r.name}
                  <StatusBadge status={r.status} />
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-zinc-400 space-y-1">
                {r.latency && <div>Latency: {r.latency} ms</div>}
                {r.message && <div>{r.message}</div>}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* WebSocket */}
      <Card className="bg-zinc-900/80 border border-zinc-700">
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            WebSocket (Binance)
            <StatusBadge status={wsStatus} />
          </CardTitle>
        </CardHeader>
      </Card>

      {/* System Info */}
      <Card className="bg-zinc-900/80 border border-zinc-700">
        <CardHeader>
          <CardTitle>System Info</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-2 text-sm text-zinc-300">
          <div>Environment: {process.env.NODE_ENV}</div>
          <div>User Agent: {clientInfo.userAgent || "Loading..."}</div>
          <div>Build Time: {clientInfo.buildTime || "Loading..."}</div>
          <div>Memory: {clientInfo.memory || "Loading..."}</div>
        </CardContent>
      </Card>
    </div>
  );
}
