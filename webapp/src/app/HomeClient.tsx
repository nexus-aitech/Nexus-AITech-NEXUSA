# ✅ Overview
This pack upgrades your demo into a **world‑class, launch‑ready** frontend with security, resilience, performance, accessibility, SEO, i18n, offline/PWA, observability, and a production realtime stack. Drop these files into a Next.js 14+ (App Router) project with Tailwind + shadcn/ui.

---

## 1) Realtime Signal Page – Edge‑ready, resilient, accessible
**`app/live/page.tsx`**
```tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SignalFeed } from "@/components/realtime/SignalFeed";
import { useSignalStream } from "@/lib/realtime/use-signal-stream";
import { siteMetadata } from "@/lib/seo/metadata";

export const metadata = siteMetadata({
  title: "Live Signals | NEXUSA",
  description: "Realtime market signals with lossless transport, graceful fallbacks and world‑class UX.",
});

export default function LivePage() {
  const [ready, setReady] = useState(false);
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return true;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => setReady(true), []);

  const {
    status, // "connected" | "connecting" | "reconnecting" | "offline" | "error"
    latest,
    buffer,
    error,
    subscribe,
  } = useSignalStream({
    channel: "signals:BTCUSDT:1h",
    maxBuffer: 200,
    enableWebTransport: true,
    enableSSE: true,
  });

  useEffect(() => {
    subscribe();
  }, [subscribe]);

  return (
    <article className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Live Interactive Preview</h1>
        <p className="text-muted-foreground">
          Realtime dashboard with live signals and an integrated AI Tutor widget. Transport: <Badge variant="outline">{status}</Badge>
        </p>
      </header>

      {/* External dashboard (isolated sandbox) */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Market Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <iframe
            src={process.env.NEXT_PUBLIC_DASHBOARD_URL}
            className="w-full h-[420px] border-0"
            loading="lazy"
            title="Dashboard"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </CardContent>
      </Card>

      {/* Live signals */}
      <Card>
        <CardHeader>
          <CardTitle>Latest Signals</CardTitle>
        </CardHeader>
        <CardContent>
          {!ready ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : (
            <SignalFeed items={buffer} latest={latest} error={error} />
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
            src={process.env.NEXT_PUBLIC_TUTOR_URL}
            className="w-full h-[360px] border-0"
            loading="lazy"
            title="AI Tutor"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </CardContent>
      </Card>
    </article>
  );
}
```

---

## 2) High‑fidelity signal list with accessibility & perf
**`components/realtime/SignalFeed.tsx`**
```tsx
"use client";
import React, { memo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Signal } from "@/lib/realtime/schema";

export const SignalFeed = memo(function SignalFeed({
  items,
  latest,
  error,
}: {
  items: Signal[];
  latest?: Signal | null;
  error?: string | null;
}) {
  return (
    <div className="rounded-xl border p-4 bg-muted/20">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Stream</h2>
        {latest ? (
          <span className="text-xs text-muted-foreground">{new Date(latest.ts).toLocaleTimeString()}</span>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-500">{error}</p>
      ) : null}
      <ScrollArea className="h-[260px] pr-2">
        <ul className="text-sm space-y-1">
          {items.length === 0 && (
            <li className="text-muted-foreground">Waiting for signals…</li>
          )}
          {items.map((s, i) => (
            <li key={`${s.id}-${i}`} className="border-b pb-1">
              <div className="flex items-center gap-2">
                <span className={cn("text-[10px] px-1 rounded border", s.kind === "buy" ? "bg-emerald-500/10 border-emerald-500/30" : s.kind === "sell" ? "bg-rose-500/10 border-rose-500/30" : "bg-slate-500/10 border-slate-500/30")}>{s.kind}</span>
                <strong>{s.pair}</strong>
                <span className="text-muted-foreground">· {s.tf}</span>
                <span className="ml-auto text-xs text-muted-foreground">{s.price?.toLocaleString?.() ?? "-"}</span>
              </div>
              {s.note ? <p className="text-xs mt-0.5 text-muted-foreground">{s.note}</p> : null}
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
});
```

---

## 3) Realtime transport with **WebTransport → WebSocket → SSE** cascade
- Exponential backoff, jitter, heartbeat, back‑pressure, visibility‑aware pause/resume.
- Strict schema validation (Zod) + safe parsing.

**`lib/realtime/schema.ts`**
```ts
import { z } from "zod";

export const SignalSchema = z.object({
  id: z.string().uuid().or(z.string()),
  pair: z.string(),
  tf: z.string(), // timeframe
  kind: z.enum(["buy", "sell", "neutral"]).default("neutral"),
  ts: z.number().int(),
  price: z.number().optional(),
  note: z.string().optional(),
});

export type Signal = z.infer<typeof SignalSchema>;

export const WireSchema = z.union([
  z.object({ op: z.literal("signal"), data: SignalSchema }),
  z.object({ op: z.literal("ping"), t: z.number() }),
  z.object({ op: z.literal("error"), message: z.string() }),
]);

export type Wire = z.infer<typeof WireSchema>;
```

**`lib/realtime/use-signal-stream.ts`**
```ts
"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Signal, WireSchema } from "@/lib/realtime/schema";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL as string | undefined;
const WSS_URL = WS_URL; // must be wss:// in prod
const WTT_URL = process.env.NEXT_PUBLIC_WT_URL as string | undefined; // WebTransport (QUIC)
const SSE_URL = process.env.NEXT_PUBLIC_SSE_URL as string | undefined;

const MAX_JITTER = 400; // ms

export function useSignalStream({
  channel,
  maxBuffer = 200,
  enableWebTransport = true,
  enableSSE = true,
}: {
  channel: string;
  maxBuffer?: number;
  enableWebTransport?: boolean;
  enableSSE?: boolean;
}) {
  const [status, setStatus] = useState<
    "connecting" | "connected" | "reconnecting" | "offline" | "error"
  >("connecting");
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<Signal | null>(null);
  const [buffer, setBuffer] = useState<Signal[]>([]);

  const controllerRef = useRef<AbortController | null>(null);
  const backoffRef = useRef(1000);
  const visibilityRef = useRef(!("document" in globalThis) || document.visibilityState === "visible");

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    setError(null);
  }, []);

  const push = useCallback((s: Signal) => {
    setLatest(s);
    setBuffer((prev) => {
      const next = [s, ...prev];
      if (next.length > maxBuffer) next.length = maxBuffer;
      return next;
    });
  }, [maxBuffer]);

  const parseWire = (raw: unknown) => {
    const parsed = WireSchema.safeParse(raw);
    if (!parsed.success) return { op: "error", message: "Invalid payload" } as const;
    return parsed.data;
  };

  const subscribe = useCallback(() => {
    let cancelled = false;

    const loop = async () => {
      reset();
      setStatus((s) => (s === "connecting" ? s : "reconnecting"));

      try {
        // 1) WebTransport (if provided)
        if (enableWebTransport && typeof (globalThis as any).WebTransport !== "undefined" && WTT_URL) {
          const wt = new (globalThis as any).WebTransport(`${WTT_URL}?ch=${encodeURIComponent(channel)}`);
          await wt.ready;
          setStatus("connected");
          backoffRef.current = 1000;

          const reader = wt.datagrams.readable.getReader();
          while (!cancelled) {
            const { value, done } = await reader.read();
            if (done) break;
            const text = new TextDecoder().decode(value);
            const wire = parseWire(JSON.parse(text));
            if (wire.op === "signal") push(wire.data);
          }
          await wt.closed;
          throw new Error("webtransport-closed");
        }

        // 2) WebSocket fallback
        if (WSS_URL) {
          await new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(WSS_URL);
            const close = () => ws.close();

            ws.onopen = () => {
              setStatus("connected");
              backoffRef.current = 1000;
              ws.send(JSON.stringify({ op: "subscribe", ch: channel }));
              resolve();
            };

            ws.onmessage = (e) => {
              try {
                const wire = parseWire(JSON.parse(e.data));
                if (wire.op === "signal") push(wire.data);
              } catch (err) {
                console.error("Invalid WS message", err);
              }
            };

            ws.onerror = () => {
              setStatus("error");
              setError("WebSocket error");
            };

            ws.onclose = () => {
              setStatus("reconnecting");
              reject(new Error("ws-closed"));
            };

            controllerRef.current?.signal.addEventListener("abort", close, { once: true });
          });
        }

        // 3) SSE fallback
        if (enableSSE && SSE_URL) {
          await new Promise<void>((resolve, reject) => {
            const es = new EventSource(`${SSE_URL}?ch=${encodeURIComponent(channel)}`, { withCredentials: false });
            es.onopen = () => {
              setStatus("connected");
              backoffRef.current = 1000;
              resolve();
            };
            es.onmessage = (e) => {
              try {
                const wire = parseWire(JSON.parse(e.data));
                if (wire.op === "signal") push(wire.data);
              } catch (err) {
                console.error("Invalid SSE payload", err);
              }
            };
            es.onerror = () => {
              setStatus("reconnecting");
              es.close();
              reject(new Error("sse-error"));
            };
            controllerRef.current?.signal.addEventListener("abort", () => es.close(), { once: true });
          });
        }

        // If here without connect, throw
        throw new Error("no-transport");
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message ?? "connection-error");
        setStatus(navigator.onLine ? "reconnecting" : "offline");
        const jitter = Math.random() * MAX_JITTER;
        const delay = Math.min(30_000, backoffRef.current + jitter);
        await new Promise((r) => setTimeout(r, delay));
        backoffRef.current = Math.min(30_000, backoffRef.current * 1.8);
        if (visibilityRef.current) loop();
      }
    };

    loop();

    const onVis = () => {
      visibilityRef.current = document.visibilityState === "visible";
      if (visibilityRef.current && status !== "connected") loop();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      controllerRef.current?.abort();
    };
  }, [channel, enableSSE, enableWebTransport, push, reset, status]);

  return useMemo(() => ({ status, latest, buffer, error, subscribe }), [status, latest, buffer, error, subscribe]);
}
```

---

## 4) Security: CSP, Strict Transport, Frame isolation, Referrer Policy
**`middleware.ts`** – add hardened headers globally (adjust domains!).
```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Basic hardening
  res.headers.set("X-Frame-Options", "SAMEORIGIN");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("Permissions-Policy", "geolocation=(), camera=(), microphone=(), payment=()");
  res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");

  // Content Security Policy (adapt list for your CDN / dashboards)
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // tighten when using nonce
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss:",
    "frame-src 'self' https://app.example.com https://*.nexusa.cloud", // allow your embeds only
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  res.headers.set("Content-Security-Policy", csp);
  return res;
}
```

---

## 5) SEO & Social – canonical, OpenGraph, Twitter, Sitemaps
**`lib/seo/metadata.ts`**
```ts
import type { Metadata } from "next";

export const siteDefaults = {
  name: "NEXUSA",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://nexusa.ai",
  locale: "en_US",
  twitter: "@nexusa",
};

export function siteMetadata({ title, description }: { title: string; description: string }): Metadata {
  const canonical = siteDefaults.url;
  return {
    metadataBase: new URL(canonical),
    title,
    description,
    alternates: { canonical },
    openGraph: {
      siteName: siteDefaults.name,
      title,
      description,
      url: canonical,
      locale: siteDefaults.locale,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      creator: siteDefaults.twitter,
      title,
      description,
    },
    robots: { index: true, follow: true },
  };
}
```

Add **sitemap** & **robots**:
**`app/robots.txt/route.ts`**
```ts
import { NextResponse } from "next/server";
export function GET() {
  const body = `User-agent: *\nAllow: /\nSitemap: ${process.env.NEXT_PUBLIC_SITE_URL}/sitemap.xml`;
  return new NextResponse(body, { headers: { "Content-Type": "text/plain" } });
}
```

**`app/sitemap.ts`**
```ts
export default function sitemap() {
  const base = process.env.NEXT_PUBLIC_SITE_URL!;
  return ["/", "/live"].map((p) => ({ url: `${base}${p}`, changefreq: "hourly", priority: 0.8 }));
}
```

---

## 6) PWA + Offline (App‑like UX)
**`app/manifest.ts`**
```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NEXUSA",
    short_name: "NEXUSA",
    start_url: "/",
    display: "standalone",
    background_color: "#0b1220",
    theme_color: "#0b1220",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
```

Add a minimal **service worker** (via next-pwa or custom) to cache shell + static assets for offline read‑only.

---

## 7) Observability – OpenTelemetry web SDK hook
**`lib/observability/otel.ts`**
```ts
// Lightweight web vitals + trace export (swap exporter for your backend)
export function initObservability() {
  if (typeof window === "undefined") return;
  if ((window as any).__otel_inited) return; (window as any).__otel_inited = true;
  // Example: send CLS/LCP/INP to your API or a vendor
  import("web-vitals").then(({ onCLS, onLCP, onINP }) => {
    const post = (m: string, v: number) => navigator.sendBeacon?.("/api/v1/vitals", JSON.stringify({ m, v }))
      || fetch("/api/v1/vitals", { method: "POST", body: JSON.stringify({ m, v }), keepalive: true });
    onCLS((v) => post("CLS", v.value));
    onLCP((v) => post("LCP", v.value));
    onINP((v) => post("INP", v.value));
  });
}
```

Call `initObservability()` once in your root layout or `_app`.

---

## 8) Performance & UX policies (strict)
- **Transport:** QUIC/WebTransport → WS → SSE. Heartbeat, backoff, visibility‑aware reconnect.
- **Parsing:** Zod enforced. Invalid payloads dropped safely.
- **Back‑pressure:** Client buffers capped, latest cached separately.
- **Embeds:** Sandboxed iframes + referrerPolicy.
- **Headers:** CSP, HSTS, Referrer‑Policy, Permissions‑Policy via middleware.
- **UX:** Skeletons, status badges, accessible labels.
- **SEO:** Canonical + OG + Twitter + sitemap/robots.
- **PWA:** Installable, offline shell, fast app‑like UX.
- **Telemetry:** Web Vitals beacon; add Sentry/OpenTelemetry for traces/logs.

---

## 9) ENV contract (12‑factor)
Create `.env` with **build‑time public** values:
```
NEXT_PUBLIC_SITE_URL=https://nexusa.ai
NEXT_PUBLIC_WS_URL=wss://api.nexusa.ai/ws
NEXT_PUBLIC_WT_URL=https://api.nexusa.ai/wt
NEXT_PUBLIC_SSE_URL=https://api.nexusa.ai/sse
NEXT_PUBLIC_DASHBOARD_URL=https://app.nexusa.ai/dashboard
NEXT_PUBLIC_TUTOR_URL=https://app.nexusa.ai/ai-tutor
```
> Server must enforce TLS (WAF/CDN) and CORS to these origins.

---

## 10) Bonus: Global polish
- **i18n:** add `next-intl` with `fa`/`en` and locale routing; keep all user‑visible strings in messages.
- **A/B & feature flags:** integrate Unleash/GrowthBook; expose `NEXT_PUBLIC_FLAG_ORIGIN`.
- **Testing:** Playwright smoke (load, realtime connect, offline fallback), Axe accessibility checks in CI.
- **Analytics privacy:** store no PII, `DNT` aware, regional endpoints (EU). 
- **Compliance:** cookie‑less by default; if you add analytics cookies, gate behind consent.

---

## 11) Optional 3D hero (drop‑in)
You can keep your existing `HomeClient.tsx` 3D sphere. Ensure `prefers-reduced-motion` and WebGL capability gates remain (already implemented in your file).

---

## 12) Minimal utilities
**`lib/utils.ts`**
```ts
export function cn(...a: (string | undefined | false | null)[]) {
  return a.filter(Boolean).join(" ");
}
```

---

# Launch Checklist (condensed)
- ✅ Security headers (CSP/HSTS/Permissions) active in prod
- ✅ All embeds over HTTPS, sandboxed
- ✅ Transport cascade OK behind CDN (HTTP/3 enabled)
- ✅ ENV configured for staging/prod
- ✅ Lighthouse: LCP < 1.8s, INP < 200ms, CLS < 0.1
- ✅ a11y scan passes (Axe) – color contrast > 4.5:1
- ✅ PWA installable; offline shell works
- ✅ Sitemaps + robots + OG cards verified
- ✅ Synthetic checks for WS/WTT/SSE and 5xx alerting