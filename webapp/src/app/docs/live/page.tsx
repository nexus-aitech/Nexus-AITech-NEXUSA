"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Live Interactive Preview | NEXUSA",
  description:
    "Realtime dashboard with market signals and AI tutor assistant, powered by WebSockets & AI integration.",
  openGraph: {
    title: "Live Interactive Preview | NEXUSA",
    description:
      "Realtime dashboard with market signals and AI tutor assistant, powered by WebSockets & AI integration.",
    type: "website",
  },
};

type Signal = {
  pair: string;
  interval: string;
  signal: string;
  timestamp: string;
};

export default function LivePage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);

  // خواندن URL از env
  const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "wss://api.example.com/ws";
  const DASHBOARD_URL =
    process.env.NEXT_PUBLIC_DASHBOARD_URL || "https://app.example.com/dashboard";
  const TUTOR_URL =
    process.env.NEXT_PUBLIC_TUTOR_URL || "https://app.example.com/ai-tutor";

  const connectWebSocket = useCallback(() => {
    if (wsRef.current) wsRef.current.close();

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          op: "subscribe",
          ch: "signals:BTCUSDT:1h",
        })
      );
    };

    ws.onmessage = (e) => {
      try {
        const data: Signal = JSON.parse(e.data);
        setSignals((prev) => [data, ...prev].slice(0, 20));
        setLoading(false);
      } catch (err) {
        console.error("Invalid WS message:", err);
      }
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };

    ws.onclose = () => {
      console.warn("WebSocket closed. Reconnecting in 3s...");
      setTimeout(connectWebSocket, 3000);
    };
  }, [WS_URL]);

  useEffect(() => {
    connectWebSocket();
    return () => wsRef.current?.close();
  }, [connectWebSocket]);

  return (
    <article className="space-y-10">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">
          Live Interactive Preview
        </h1>
        <p className="text-muted-foreground mt-2">
          Realtime dashboard with live signals and an integrated AI Tutor widget.
        </p>
      </header>

      {/* داشبورد */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Market Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <iframe
            src={DASHBOARD_URL}
            className="w-full h-[400px] border-0"
            loading="lazy"
            title="Dashboard"
          />
        </CardContent>
      </Card>

      {/* سیگنال‌ها */}
      <Card>
        <CardHeader>
          <CardTitle>Latest Signals</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : signals.length === 0 ? (
            <p className="text-muted-foreground">Waiting for signals…</p>
          ) : (
            <ScrollArea className="h-[250px] pr-2">
              <ul className="space-y-2 text-sm">
                {signals.map((s, i) => (
                  <li
                    key={i}
                    className="p-2 rounded-md border bg-muted/30 hover:bg-muted/50 transition"
                  >
                    <div className="flex justify-between font-medium">
                      <span>{s.pair} · {s.interval}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(s.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs mt-1">{s.signal}</p>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* AI Tutor */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>AI Tutor</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <iframe
            src={TUTOR_URL}
            className="w-full h-[350px] border-0"
            loading="lazy"
            title="AI Tutor"
          />
        </CardContent>
      </Card>
    </article>
  );
}
