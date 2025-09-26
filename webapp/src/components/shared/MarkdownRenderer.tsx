"use client";

import * as React from "react";
import { renderMarkdown, type MarkdownOptions } from "@/lib/markdown";

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export interface MarkdownRendererProps extends MarkdownOptions {
  md: string;
  className?: string;
}

export default async function MarkdownRenderer({
  md,
  className,
  ...opts
}: MarkdownRendererProps) {
  const html = await renderMarkdown(md, opts);
  return (
    <article
      className={cn(
        "prose prose-invert max-w-none",
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
