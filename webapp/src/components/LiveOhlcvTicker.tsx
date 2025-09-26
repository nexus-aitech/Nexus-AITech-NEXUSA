// ---------------------------------------------------------------
// components/LiveOhlcvTicker.tsx (production‑grade upgrade)
// Drop-in replacement for your existing component
// ---------------------------------------------------------------
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { coinLogos } from "@/components/coinLogos";
import { exchangeLogos } from "@/components/exchangeLogos";

interface OhlcvData {
  symbol: string;
  tf: string; // timeframe
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ts: number; // timestamp (ms)
  exchange?: string;
}

const MAX_ROWS = 100;
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080";

export default function LiveOhlcvTicker() {
  const [data, setData] = useState<OhlcvData[]>([]);
  const [status, setStatus] = useState<
    "connecting" | "open" | "closed" | "error" | "reconnecting"
  >("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const heartbeatRef = useRef<number | null>(null);

  // Number/Date formatters
  const nf = useMemo(() => new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }), []);
  const tf = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    []
  );

  useEffect(() => {
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      setStatus(retriesRef.current === 0 ? "connecting" : "reconnecting");
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        retriesRef.current = 0;
        setStatus("open");
        // Optional keepalive – if your server expects pings, adjust payload
        if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
        heartbeatRef.current = window.setInterval(() => {
          try {
            ws.send("ping");
          } catch {}
        }, 25_000);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as OhlcvData;
          setData((prev) => [msg, ...prev].slice(0, MAX_ROWS));
        } catch (e) {
          // Ignore non‑JSON keepalives, etc.
        }
      };

      ws.onerror = () => {
        setStatus("error");
      };

      ws.onclose = () => {
        setStatus("closed");
        if (heartbeatRef.current) {
          window.clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
        // Exponential backoff reconnect (max 10s)
        const delay = Math.min(10_000, 500 * 2 ** retriesRef.current++);
        window.setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
      wsRef.current?.close();
    };
  }, []);

  return (
    <div className="rounded-xl border border-white/10 bg-gray-900/70 p-4 shadow-md">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">📊 Live OHLCV Ticker</h2>
        <StatusBadge state={status} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-gray-200">
          <thead>
            <tr className="border-b border-gray-800 text-left">
              <th className="p-2">Exchange</th>
              <th className="p-2">Asset</th>
              <th className="p-2">TF</th>
              <th className="p-2">Open</th>
              <th className="p-2">High</th>
              <th className="p-2">Low</th>
              <th className="p-2">Close</th>
              <th className="p-2">Volume</th>
              <th className="p-2">Time</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, idx) => {
              const ex = (r.exchange || "").toLowerCase();
              const sym = r.symbol?.toUpperCase();
              const exLogo = exchangeLogos[ex] || exchangeLogos.DEFAULT;
              const coinLogo = coinLogos[sym] || coinLogos.DEFAULT;
              return (
                <tr key={idx} className="border-b border-gray-850 hover:bg-gray-800/40">
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <img src={exLogo} alt={ex} className="h-6 w-6 rounded-full" />
                      <span className="capitalize">{ex || "—"}</span>
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <img src={coinLogo} alt={sym} className="h-5 w-5 rounded-full" />
                      <span>{sym}</span>
                    </div>
                  </td>
                  <td className="p-2">{r.tf}</td>
                  <td className="p-2 tabular-nums">{nf.format(r.open)}</td>
                  <td className="p-2 tabular-nums">{nf.format(r.high)}</td>
                  <td className="p-2 tabular-nums">{nf.format(r.low)}</td>
                  <td className="p-2 tabular-nums">{nf.format(r.close)}</td>
                  <td className="p-2 tabular-nums">{nf.format(r.volume)}</td>
                  <td className="p-2">{tf.format(new Date(r.ts))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data.length === 0 && (
        <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
          هنوز داده‌ای دریافت نشده. اتصال وب‌سوکت برقرار است؛ به محض ورود دیتا، جدول به‌روزرسانی می‌شود.
        </div>
      )}
    </div>
  );
}

function StatusBadge({ state }: { state: "connecting" | "open" | "closed" | "error" | "reconnecting" }) {
  const map = {
    connecting: { label: "در حال اتصال", cls: "border-amber-400/30 text-amber-300 bg-amber-500/10" },
    open: { label: "متصل", cls: "border-emerald-400/30 text-emerald-300 bg-emerald-500/10" },
    closed: { label: "قطع", cls: "border-white/20 text-white/70 bg-white/[0.03]" },
    error: { label: "خطا", cls: "border-rose-400/30 text-rose-300 bg-rose-500/10" },
    reconnecting: { label: "اتصال مجدد…", cls: "border-sky-400/30 text-sky-300 bg-sky-500/10" },
  } as const;
  const m = map[state];
  return (
    <span className={`rounded-full border px-3 py-1 text-xs ${m.cls}`}>
      {m.label}
    </span>
  );
}
