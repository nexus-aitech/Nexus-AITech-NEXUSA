// ─────────────────────────────────────────────────────────────────────────────
// NEXUSA • World‑class Docs scaffold (Next.js App Router, TS, Tailwind, shadcn)
// Drop these files into your webapp. All pages are production‑ready and typed.
// Paths assume: webapp/app/docs/... and webapp/components/docs/...
// ─────────────────────────────────────────────────────────────────────────────


// ============================================================================
// FILE: app/docs/layout.tsx
// ----------------------------------------------------------------------------
import React from "react";
import Link from "next/link";
import { Sidebar } from "@/components/docs/Sidebar";
import { TOC } from "@/components/docs/TOC";
import { DocHeader } from "@/components/docs/DocHeader";
import type { Metadata } from "next";


export const metadata: Metadata = {
title: {
default: "NEXUSA Docs",
template: "%s | NEXUSA Docs",
},
description:
"Technical documentation for NEXUSA: ingestion, signals, backtesting, and APIs (REST & WebSocket).",
openGraph: {
title: "NEXUSA Docs",
description:
"Production documentation for real‑time analytics, ingestion pipelines, signal engine, and APIs.",
url: "/docs",
siteName: "NEXUSA",
type: "website",
},
robots: { index: true, follow: true },
};


export default function DocsLayout({ children }: { children: React.ReactNode }) {
return (
<div className="min-h-screen w-full bg-background text-foreground">
<DocHeader />
<div className="container mx-auto grid grid-cols-12 gap-6 px-4 pb-16 pt-4">
<aside className="col-span-12 lg:col-span-3 xl:col-span-2">
<Sidebar />
</aside>
<main className="col-span-12 lg:col-span-7 xl:col-span-8 prose prose-neutral dark:prose-invert max-w-none">
{children}
</main>
<aside className="col-span-12 lg:col-span-2 xl:col-span-2 hidden lg:block">
<TOC />
</aside>
</div>
<footer className="border-t py-6 text-center text-sm text-muted-foreground">
© {new Date().getFullYear()} NEXUSA • Built for real‑time trading research
</footer>
</div>
);
}