"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkEmoji from "remark-emoji";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeExternalLinks from "rehype-external-links";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { Copy, ClipboardCheck, Link as LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils"; // if you have a className util; otherwise remove and inline

/**
 * MarkdownRenderer – production‑ready markdown with:
 *  - GFM (tables, task lists)
 *  - Emojis 🙂, soft line breaks
 *  - Heading slugs + autolink anchors
 *  - Safe HTML via sanitize (extended to allow code classes)
 *  - Syntax highlighting classes (Prism‑compatible) + Copy button
 *  - Optional sticky Table of Contents
 */
export type MarkdownRendererProps = {
  md: string;
  className?: string;
  showToc?: boolean;
  tocMaxDepth?: 1 | 2 | 3 | 4 | 5 | 6;
};

// Extend sanitize schema to keep code classnames like language-ts, language-js etc.
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code || []), ["className"]],
    span: [...(defaultSchema.attributes?.span || []), ["className"]],
    pre: [...(defaultSchema.attributes?.pre || []), ["className"]],
  },
};

// Very light heading extractor (supports # through ######)
function extractHeadings(md: string, maxDepth: number) {
  const lines = md.split(/\r?\n/);
  const items: { depth: number; text: string; id: string }[] = [];
  for (const line of lines) {
    const m = /^(#{1,6})\s+([^#].*)$/.exec(line.trim());
    if (!m) continue;
    const depth = m[1].length;
    if (depth > maxDepth) continue;
    const raw = m[2].trim();
    const id = raw
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF\s-]/gi, "")
      .replace(/\s+/g, "-");
    items.push({ depth, text: raw, id });
  }
  return items;
}

export default function MarkdownRenderer({ md, className, showToc = true, tocMaxDepth = 3 }: MarkdownRendererProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const headings = useMemo(() => extractHeadings(md, tocMaxDepth), [md, tocMaxDepth]);

  // Copy helper
  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(key);
      setTimeout(() => setCopiedId(null), 1200);
    } catch {}
  }

  // Prism/Code styles: we just add classnames; include a Prism theme CSS globally, or tailwind‑typography.
  const components: Parameters<typeof ReactMarkdown>[0]["components"] = {
    h1: ({ node, ...props }) => <h1 className="mt-8 text-3xl font-bold" {...props} />,
    h2: ({ node, ...props }) => <h2 className="mt-8 text-2xl font-semibold" {...props} />,
    h3: ({ node, ...props }) => <h3 className="mt-6 text-xl font-semibold" {...props} />,
    table: ({ node, ...props }) => (
      <div className="my-4 overflow-x-auto rounded-lg border">
        <table className="w-full text-sm" {...props} />
      </div>
    ),
    a: ({ node, href, children, ...props }) => (
      <a href={href} {...props} className="text-primary underline underline-offset-2">
        {children}
      </a>
    ),
    pre: ({ node, ...props }) => (
      <div className="group relative my-4 overflow-hidden rounded-xl border bg-black/60">
        {/* Copy button appears on hover */}
        <button
          type="button"
          onClick={() => {
            const code = (props.children as any)?.[0]?.props?.children?.toString?.() || "";
            copy(code, (props as any)?.['data-language'] || "code");
          }}
          className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/40 px-2 py-1 text-xs opacity-0 transition group-hover:opacity-100"
        >
          {copiedId ? <ClipboardCheck className="h-3.5 w-3.5"/> : <Copy className="h-3.5 w-3.5"/>}
          <span>{copiedId ? "Copied" : "Copy"}</span>
        </button>
        <pre {...props} />
      </div>
    ),
    code: ({ node, inline, className, children, ...props }) => {
      const match = /language-(\w+)/.exec(className || "");
      if (inline) {
        return (
          <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.85em]" {...props}>
            {children}
          </code>
        );
      }
      return (
        <code className={cn("block font-mono text-[0.85em] leading-relaxed", className)} {...props}>
          {children}
        </code>
      );
    },
    blockquote: ({ node, ...props }) => (
      <blockquote className="my-4 border-l-4 border-primary/60 bg-primary/5 px-4 py-2 text-white/90" {...props} />
    ),
    hr: () => <hr className="my-8 border-border"/>,
    ul: ({ node, ...props }) => <ul className="my-4 list-disc pl-6" {...props} />,
    ol: ({ node, ...props }) => <ol className="my-4 list-decimal pl-6" {...props} />,
    li: ({ node, ...props }) => <li className="my-1" {...props} />,
    p: ({ node, ...props }) => <p className="my-4 leading-7" {...props} />,
    img: ({ node, ...props }) => (
      <img loading="lazy" className="my-3 max-h-[480px] w-auto rounded-lg border" {...(props as any)} />
    ),
  };

  return (
    <div className={cn("grid gap-6 md:grid-cols-[minmax(0,1fr)_260px]", className)}>
      {/* Content */}
      <article className="prose prose-invert max-w-none prose-pre:p-0">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks, remarkEmoji]}
          rehypePlugins={[
            rehypeSlug,
            [rehypeAutolinkHeadings, { behavior: "append", properties: { className: ["ml-1", "no-underline"] }, content: { type: "text", value: "#" } }],
            [rehypeExternalLinks, { target: "_blank", rel: ["nofollow", "noopener", "noreferrer"] }],
            [rehypeSanitize, schema as any],
          ]}
          components={components}
        >
          {md}
        </ReactMarkdown>
      </article>

      {/* TOC */}
      {showToc && headings.length > 0 && (
        <aside className="sticky top-24 hidden h-max md:block">
          <div className="rounded-xl border p-4 text-sm">
            <div className="mb-2 font-medium text-white/90">On this page</div>
            <nav className="space-y-1">
              {headings.map((h, i) => (
                <a
                  key={`${h.id}-${i}`}
                  href={`#${h.id}`}
                  className={cn(
                    "flex items-center gap-1 text-white/70 hover:text-white transition",
                    h.depth === 1 && "pl-0 font-semibold",
                    h.depth === 2 && "pl-2",
                    h.depth >= 3 && "pl-4 text-white/60"
                  )}
                >
                  <LinkIcon className="h-3.5 w-3.5"/>
                  <span className="truncate">{h.text}</span>
                </a>
              ))}
            </nav>
          </div>
        </aside>
      )}
    </div>
  );
}
