"use client";

import { useEffect, useState } from "react";
import { remark } from "remark";
import html from "remark-html";

export default function MarkdownRenderer({ md }: { md: string }) {
  const [h, setH] = useState<string>("<p></p>");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const file = await remark().use(html).process(md || "");
        if (!cancelled) setH(String(file));
      } catch (e) {
        if (!cancelled) setH("<p>Failed to render markdown.</p>");
      }
    })();
    return () => { cancelled = true; };
  }, [md]);

  return <div dangerouslySetInnerHTML={{ __html: h }} />;
}
