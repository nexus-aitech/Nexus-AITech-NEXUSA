"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Compass, Home, LifeBuoy, Search, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function NotFound() {
  const pathname = usePathname();
  const qs = useSearchParams();
  const [query, setQuery] = useState("");
  const [incidentId, setIncidentId] = useState<string | null>(null);

  const payload = useMemo(
    () => ({
      type: "404",
      path: pathname,
      query: qs?.toString() || undefined,
      ts: new Date().toISOString(),
      userAgent:
        typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    }),
    [pathname, qs]
  );

  useEffect(() => {
    // Best-effort telemetry (اختیاری – اگر بک‌اند داری)
    (async () => {
      try {
        const r = await fetch("/api/telemetry/404", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (r.ok) {
          const data = await r.json().catch(() => ({} as any));
          if (data?.incidentId) setIncidentId(String(data.incidentId));
        }
      } catch {
        /* ignore */
      }
    })();
  }, [payload]);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    window.location.href = `/search?q=${encodeURIComponent(q)}`;
  }

  const refCode =
    incidentId ||
    `NF-${
      (pathname || "/").slice(1).replace(/[^a-zA-Z0-9]+/g, "-") || "home"
    }`;

  return (
    <main
      className="min-h-[100dvh] relative bg-gradient-to-b from-background to-muted text-white"
      aria-labelledby="nf-title"
      role="main"
    >
      {/* Decorative background */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(50%_60%_at_70%_20%, rgba(93,140,255,0.25), transparent 60%),radial-gradient(40%_50%_at_20%_80%, rgba(122,160,255,0.18), transparent 60%)",
        }}
      />

      <div className="container-responsive pt-16 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="max-w-2xl"
        >
          <Badge
            variant="secondary"
            className="mb-3 flex w-fit items-center gap-2"
            aria-live="polite"
          >
            <TriangleAlert className="h-4 w-4" /> 404 • Page not found
          </Badge>

          <h1 id="nf-title" className="text-4xl md:text-6xl font-extrabold tracking-tight">
            We can’t find that page
          </h1>

          <p className="mt-3 text-white/70">
            The URL may be mistyped, moved, or no longer available. Try searching, go back, or head to the homepage.
          </p>

          {/* Quick actions */}
          <div className="mt-6 flex flex-wrap gap-3" aria-label="Quick actions">
            <Button asChild>
              <Link href="/">
                <span className="flex items-center">
                  <Home className="mr-2 h-4 w-4" /> Go home
                </span>
              </Link>
            </Button>

            <Button asChild variant="secondary">
              <Link href="#search">
                <span className="flex items-center">
                  <Search className="mr-2 h-4 w-4" /> Search
                </span>
              </Link>
            </Button>

            <Button asChild variant="secondary">
              <Link
                href={{
                  pathname: "/contact",
                  query: { topic: "support", ref: "404" },
                }}
              >
                <span className="flex items-center">
                  <LifeBuoy className="mr-2 h-4 w-4" /> Contact support
                </span>
              </Link>
            </Button>
          </div>

          {/* Search card */}
          <Card className="glass mt-8">
            <CardContent className="p-4">
              <form id="search" className="flex gap-2" onSubmit={onSearch} role="search" aria-label="Site search">
                <div className="relative grow">
                  <Search
                    aria-hidden="true"
                    className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60"
                  />
                  <Input
                    className="pl-8"
                    placeholder="Search NEXUSA…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Search query"
                  />
                </div>
                <Button type="submit">
                  <span className="flex items-center">
                    <Compass className="mr-2 h-4 w-4" /> Search
                  </span>
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Helpful links */}
          <div className="mt-8 grid gap-3 md:grid-cols-2" aria-label="Helpful links">
            {[
              { title: "Pricing & Plans", href: "/pricing" },
              { title: "Sign up", href: "/signup" },
              { title: "Data & Signals", href: "/data-signals" },
              { title: "Backtesting", href: "/backtesting" },
              { title: "Charts & Analytics", href: "/charts" },
              { title: "About NEXUSA", href: "/about" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="group rounded-xl border border-white/10 bg-white/5 p-4 transition hover:shadow-md hover:bg-white/7"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{l.title}</span>
                  <ArrowLeft className="h-4 w-4 rotate-180 opacity-0 transition group-hover:opacity-100" />
                </div>
              </Link>
            ))}
          </div>

          {/* Footnote */}
          <p className="mt-8 text-xs text-white/60">
            Reference: <span className="font-mono">{refCode}</span>
          </p>
        </motion.div>
      </div>

      {/* Bottom gradient overlay */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />
    </main>
  );
}
