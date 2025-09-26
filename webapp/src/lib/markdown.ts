// ==============================================
// File: src/lib/markdown.ts
// Markdown → HTML renderer (server-side, secure)
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

let rehypeKatex: any = null;
try {
  rehypeKatex = require("rehype-katex");
} catch {}

export type MarkdownOptions = {
  allowRawHtml?: boolean;
  externalLinks?: boolean;
  highlight?: boolean;
  math?: boolean;
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
        className: ["group", "scroll-mt-24", "no-underline"],
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
        ["src", /^(https?:)?\/\//],
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
