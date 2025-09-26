// ============================================================================
// FILE: components/docs/TOC.tsx
// ----------------------------------------------------------------------------
"use client";
import React, { useEffect, useState } from "react";


export function TOC() {
const [items, setItems] = useState<{ id: string; text: string; level: number }[]>([]);
useEffect(() => {
const hs = Array.from(document.querySelectorAll("main h1, main h2, main h3")) as HTMLHeadingElement[];
setItems(
hs.map((h) => ({ id: h.id, text: h.textContent || "", level: Number(h.tagName.substring(1)) }))
);
}, []);
return (
<div className="sticky top-4">
<p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">On this page</p>
<ul className="space-y-1 text-sm">
{items.map((i) => (
<li key={i.id} className={`pl-${(i.level - 1) * 2}`}>
<a href={`#${i.id}`} className="text-muted-foreground hover:text-foreground">
{i.text}
</a>
</li>
))}
</ul>
</div>
);
}