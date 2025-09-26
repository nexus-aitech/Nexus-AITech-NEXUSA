// ============================================================================
// FILE: components/docs/DocHeader.tsx
// ----------------------------------------------------------------------------
"use client";
import React from "react";
import Link from "next/link";


export function DocHeader() {
return (
<header className="border-b bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/60">
<div className="container mx-auto flex items-center justify-between px-4 py-3">
<Link href="/" className="text-lg font-semibold tracking-tight">
NEXUSA <span className="text-muted-foreground">Docs</span>
</Link>
<nav className="hidden gap-4 text-sm md:flex">
<Link href="/docs/intro" className="hover:underline">Docs</Link>
<Link href="/community" className="hover:underline">Community</Link>
<Link href="/backtesting" className="hover:underline">Backtesting</Link>
</nav>
</div>
</header>
);
}