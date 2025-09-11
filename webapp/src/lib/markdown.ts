// ==============================================
// File: webapp/src/lib/markdown.ts
// Secure, world-class Markdown → HTML renderer (server-side)
// - GFM (tables, task-lists, autolink, strikethrough, footnotes)
// - Headings with slugs and autolink anchors
// - External links hardened (target=_blank, rel=noopener noreferrer nofollow ugc)
// - XSS-safe with rehype-sanitize (raw HTML blocked by default)
// - Code highlighting via rehype-highlight (add minimal CSS in globals)
// - Optional math support (remark-math + rehype-katex)
// ==============================================

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeExternalLinks from "rehype-external-links";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";

// Optional: only import rehype-katex if math is enabled at call-site
let rehypeKatex: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  rehypeKatex = require("rehype-katex");
} catch {}

export type MarkdownOptions = {
  allowRawHtml?: boolean; // default false (safer)
  externalLinks?: boolean; // default true
  highlight?: boolean; // default true
  math?: boolean; // default false
};

export async function renderMarkdown(md: string, opts: MarkdownOptions = {}) {
  const {
    allowRawHtml = false,
    externalLinks = true,
    highlight = true,
    math = false,
  } = opts;

  const schema = buildSanitizeSchema();

  const pipeline = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(math ? remarkMath : () => {})
    .use(remarkRehype, { allowDangerousHtml: allowRawHtml })
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      behavior: "wrap",
      properties: {
        className: [
          "group",
          "scroll-mt-24",
          "no-underline",
        ],
      },
    })
    .use(externalLinks ? rehypeExternalLinks : () => {}, {
      target: "_blank",
      rel: ["noopener", "noreferrer", "nofollow", "ugc"],
    })
    .use(rehypeSanitize, schema)
    .use(highlight ? rehypeHighlight : () => {})
    .use(math && rehypeKatex ? rehypeKatex : () => {})
    .use(rehypeStringify, { allowDangerousHtml: false });

  const file = await pipeline.process(md || "");
  return String(file);
}

function buildSanitizeSchema() {
  // Extend default schema to allow language-* classes on <code>
  const codeLang = ["className", /^language-[a-z0-9+\-]+$/i] as const;
  const anchorTarget = ["target", /^(_blank|_self)$/] as const;
  const anchorRel = [
    "rel",
    /^(?:noopener|noreferrer|nofollow|ugc)(?:\s+(?:noopener|noreferrer|nofollow|ugc))*$/,
  ] as const;

  return {
    ...defaultSchema,
    attributes: {
      ...defaultSchema.attributes,
      code: [...(defaultSchema.attributes?.code || []), codeLang],
      a: [
        ...(defaultSchema.attributes?.a || []),
        anchorTarget,
        anchorRel,
        ["href", true],
        ["title", true],
      ],
      img: [
        ...(defaultSchema.attributes?.img || []),
        ["src", /^(https?:)?\/\//], // allow http/https only
        ["alt", true],
        ["title", true],
        ["width", true],
        ["height", true],
      ],
    },
    protocols: {
      ...(defaultSchema as any).protocols,
      href: ["http", "https", "mailto", "tel"],
      src: ["http", "https"],
    },
  } as typeof defaultSchema;
}


// ==============================================
// File: webapp/src/components/shared/MarkdownRenderer.tsx
// Server Component wrapper around renderMarkdown()
// - Safe by default (no raw HTML)
// - Tailwind-friendly prose classes
// ==============================================

import * as React from "react";
import { renderMarkdown, type MarkdownOptions } from "@/lib/markdown";

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export interface MarkdownRendererProps extends MarkdownOptions {
  md: string;
  className?: string;
}

export default async function MarkdownRenderer({ md, className, ...opts }: MarkdownRendererProps) {
  const html = await renderMarkdown(md, opts);
  return (
    <article
      className={cn(
        // Tailwind Typography (if plugin active); otherwise it still looks fine with our overrides
        "prose prose-invert max-w-none",
        // Tweaks for headings, code, tables, blockquotes, lists
        "prose-headings:scroll-mt-24 prose-h1:mb-4 prose-h2:mt-8 prose-h2:mb-3",
        "prose-code:rounded prose-code:bg-white/10 prose-code:px-1.5 prose-code:py-0.5",
        "prose-pre:rounded-xl prose-pre:border prose-pre:border-white/10 prose-pre:bg-black/70",
        "prose-a:text-sky-300 hover:prose-a:text-sky-200",
        "prose-img:rounded-xl",
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ==============================================
// Optional: minimal CSS for highlight.js (add to globals.css if you don't import a theme)
// ==============================================
// .hljs { background: transparent; color: #e5e7eb; }
// pre code.hljs { display:block; padding: 1rem; border-radius: 0.75rem; }
// .hljs-keyword { font-weight: 600; }
// .hljs-string { color: #a7f3d0; }
// .hljs-number { color: #93c5fd; }
// .hljs-literal, .hljs-symbol { color: #fda4af; }
// .hljs-title, .hljs-section { color: #fde68a; }
// .hljs-comment { color: #9ca3af; }
