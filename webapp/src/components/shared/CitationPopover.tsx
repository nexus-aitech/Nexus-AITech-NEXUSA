"use client";
// webapp/src/components/shared/CitationPopover.tsx (Pro)
// طراحی پیشرفته، دسترس‌پذیر و قابل‌گسترش برای نمایش منابع
// بدون وابستگی به کتابخانهٔ UI خارجی (فقط React + Tailwind)

import * as React from "react";
import Link from "next/link";

// ===== Types =====
export type RawCitation =
  | string
  | {
      id?: string;
      label?: string; // متن کوتاه نمایش
      title?: string; // عنوان کامل
      href?: string;
      domain?: string; // مثال: example.com
      authors?: string[];
      date?: string; // ISO یا هر متن
      type?: "article" | "paper" | "dataset" | "code" | "report" | "web";
      doi?: string;
      snippet?: string; // خلاصه/نقل‌قول
      tags?: string[];
      reliability?: number; // 0..100
      archived_url?: string;
    };

export interface CitationPopoverProps {
  items: RawCitation[];
  triggerLabel?: string; // متن دکمه
  className?: string;
  mode?: "auto" | "popover" | "dialog" | "inline";
  defaultOpen?: boolean;
  maxHeight?: number; // ارتفاع اسکرول پنل
}

// ===== Helpers =====
function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function normalize(items: RawCitation[]) {
  const seen = new Set<string>();
  return items
    .map((it, i) => {
      if (typeof it === "string") {
        return { id: String(i), label: it, title: it };
      }
      return { id: it.id ?? String(i), ...it };
    })
    .filter((it) => {
      const key = (it.doi || it.href || it.title || it.label || it.id || "")
        .toString()
        .trim()
        .toLowerCase();
      if (!key) return false;
      if (seen.has(key)) return false; // dedupe
      seen.add(key);
      return true;
    });
}

function domainFromHref(href?: string, fallback?: string) {
  try {
    if (!href) return fallback;
    const u = new URL(href);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return fallback;
  }
}

function asAPA(c: any) {
  const authors = c.authors?.length ? c.authors.join(", ") : "";
  const date = c.date ? ` (${c.date})` : "";
  const title = c.title || c.label || c.href || "Untitled";
  const host = domainFromHref(c.href, c.domain);
  const url = c.href ? ` ${c.href}` : "";
  return `${authors}${authors ? "." : ""}${date}. ${title}. ${host || ""}.${url}`.replace(/\s+/g, " ").trim();
}

function asBibTeX(c: any) {
  const key = (c.authors?.[0] || "ref") + (c.date?.slice(0, 4) || "");
  return `@misc{${key},\n  title={${c.title || c.label || "Untitled"}},\n  author={${(c.authors || []).join(" and ")}},\n  howpublished={\\url{${c.href || ""}}},\n  note={${c.domain || domainFromHref(c.href, "")}},\n  year={${c.date?.slice(0, 4) || ""}}\n}`;
}

function copy(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  return Promise.reject(new Error("Clipboard unavailable"));
}

// ===== Core UI =====
export function CitationPopover({
  items,
  triggerLabel = "منابع",
  className,
  mode = "auto",
  defaultOpen = false,
  maxHeight = 360,
}: CitationPopoverProps) {
  const data = normalize(items);
  const [open, setOpen] = React.useState(defaultOpen);
  const [query, setQuery] = React.useState("");
  const listRef = React.useRef<HTMLDivElement>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter((c) =>
      [c.label, c.title, c.href, c.authors?.join(" "), c.tags?.join(" ")]
        .filter(Boolean)
        .some((t) => String(t).toLowerCase().includes(q))
    );
  }, [data, query]);

  const effectiveMode = React.useMemo(() => {
    if (mode !== "auto") return mode;
    return data.length > 6 ? "dialog" : "popover";
  }, [mode, data.length]);

  if (!data.length) return null;

  // Inline mode: فقط لیست ساده (بدون پنل)
  if (effectiveMode === "inline") {
    return (
      <div className={cn("text-xs text-white/80 space-y-2", className)} dir="rtl">
        <div className="font-semibold">{triggerLabel} ({data.length})</div>
        <ul className="space-y-2 list-disc pr-5">
          {data.map((c) => (
            <li key={c.id} className="marker:text-white/40">
              <CitationRow c={c} dense />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className={cn("relative inline-block", className)} dir="rtl">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs",
          "bg-white/10 hover:bg-white/15 text-white transition",
          "border border-white/10"
        )}
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
        {triggerLabel} (<span className="tabular-nums">{data.length}</span>)
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 opacity-70">
          <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" />
        </svg>
      </button>

      {open && effectiveMode === "popover" && (
        <div
          role="dialog"
          aria-label="لیست منابع"
          className={cn(
            "absolute z-50 mt-2 w-[min(86vw,560px)] origin-top-right",
            "rounded-2xl border border-white/10 bg-black/90 shadow-2xl backdrop-blur",
            "p-3"
          )}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <HeaderBar
            onClose={() => setOpen(false)}
            query={query}
            setQuery={setQuery}
            count={filtered.length}
            total={data.length}
          />
          <div
            ref={listRef}
            className="mt-3 max-h-[var(--maxh,360px)] overflow-auto pr-1"
            style={{
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore: custom property
              "--maxh": `${maxHeight}px`,
            }}
          >
            <List items={filtered} />
          </div>
          <FooterBar items={filtered} />
        </div>
      )}

      {open && effectiveMode === "dialog" && (
        <Dialog onClose={() => setOpen(false)}>
          <div className="mx-auto w-[min(96vw,760px)]">
            <HeaderBar
              onClose={() => setOpen(false)}
              query={query}
              setQuery={setQuery}
              count={filtered.length}
              total={data.length}
            />
            <div className="mt-3 max-h-[66vh] overflow-auto pr-1">
              <List items={filtered} />
            </div>
            <FooterBar items={filtered} />
          </div>
        </Dialog>
      )}
    </div>
  );
}

// ===== Subcomponents =====
function HeaderBar({
  onClose,
  query,
  setQuery,
  count,
  total,
}: {
  onClose: () => void;
  query: string;
  setQuery: (v: string) => void;
  count: number;
  total: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        placeholder="جستجو در منابع…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className={cn(
          "flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2",
          "text-xs text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
        )}
      />
      <div className="text-[11px] text-white/60 tabular-nums">
        {count} / {total}
      </div>
      <button
        onClick={onClose}
        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
      >
        بستن
      </button>
    </div>
  );
}

function FooterBar({ items }: { items: any[] }) {
  const handleOpenAll = () => {
    items.forEach((c) => {
      if (c.href) window.open(c.href, "_blank", "noopener,noreferrer");
    });
  };

  const handleCopyAPA = async () => {
    try {
      await copy(items.map(asAPA).join("\n"));
    } catch {}
  };

  const handleCopyBib = async () => {
    try {
      await copy(items.map(asBibTeX).join("\n\n"));
    } catch {}
  };

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-xs">
      <div className="text-white/50">
        {items.length ? "اقدامات" : ""}
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={handleOpenAll} className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/15">
          بازکردن همه لینک‌ها
        </button>
        <button onClick={handleCopyAPA} className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/15">
          کپی APA
        </button>
        <button onClick={handleCopyBib} className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/15">
          کپی BibTeX
        </button>
      </div>
    </div>
  );
}

function List({ items }: { items: any[] }) {
  return (
    <ul className="space-y-2">
      {items.map((c) => (
        <li key={c.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <CitationRow c={c} />
        </li>
      ))}
    </ul>
  );
}

function CitationRow({ c, dense = false }: { c: any; dense?: boolean }) {
  const host = domainFromHref(c.href, c.domain);
  const score = typeof c.reliability === "number" ? Math.max(0, Math.min(100, c.reliability)) : null;
  return (
    <div className={cn("grid gap-2", dense ? "" : "sm:grid-cols-[1fr_auto]") }>
      <div>
        <div className="flex items-center gap-2">
          <Favicon host={host} />
          <div className="font-medium text-white/90">
            {c.title || c.label || host || c.href}
          </div>
        </div>
        {c.snippet && (
          <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-white/70">{c.snippet}</div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-white/60">
          {host && <span>{host}</span>}
          {c.date && <span>• {c.date}</span>}
          {c.type && <Badge>{c.type}</Badge>}
          {c.tags?.slice(0, 5).map((t: string) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 text-xs">
        {score !== null && (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-emerald-400" style={{ width: `${score}%` }} />
            </div>
            <span className="tabular-nums text-white/70">{score}</span>
          </div>
        )}
        {c.href && (
          <Link
            href={c.href}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white/90 hover:bg-white/10"
          >
            مشاهده
          </Link>
        )}
        <button
          onClick={() => copy(asAPA(c))}
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white/90 hover:bg-white/10"
        >
          کپی APA
        </button>
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/70">
      {children}
    </span>
  );
}

function Favicon({ host }: { host?: string | null }) {
  if (!host) return null;
  const src = `https://icons.duckduckgo.com/ip3/${host}.ico`;
  return (
    <img
      src={src}
      alt=""
      className="h-4 w-4 rounded-sm ring-1 ring-white/10"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

// ===== Accessible modal dialog without external libs =====
function Dialog({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-black/70 py-10"
      onClick={onClose}
    >
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-black/90 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

