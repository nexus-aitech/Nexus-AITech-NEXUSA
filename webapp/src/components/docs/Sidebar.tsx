// ============================================================================
// FILE: components/docs/Sidebar.tsx
// ----------------------------------------------------------------------------
"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";


const links = [
{ href: "/docs/intro", label: "Introduction" },
{ href: "/docs/quickstart", label: "Quickstart" },
{ href: "/docs/ingestion", label: "Ingestion" },
{ href: "/docs/signals", label: "Signals" },
{ href: "/docs/backtesting", label: "Backtesting" },
{ href: "/docs/api/rest", label: "REST API" },
{ href: "/docs/api/ws", label: "WebSocket API" },
];


export function Sidebar() {
const pathname = usePathname();
return (
<nav className="sticky top-4 space-y-1">
{links.map((l) => {
const active = pathname?.startsWith(l.href);
return (
<Link
key={l.href}
href={l.href}
className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
active
? "bg-primary/10 text-primary font-medium"
: "hover:bg-muted text-muted-foreground"
}`}
>
{l.label}
</Link>
);
})}
</nav>
);
}