// webapp/src/app/sitemap.ts
import type { MetadataRoute } from "next";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://www.nexus-aitech.net";

  // مسیرهای اصلی سایت (در صورت داشتن صفحات داینامیک، این لیست را از دیتابیس/ API بساز)
  const staticPaths = [
    "",           // /
    "about",
    "contact",
    "signup",
    "feedback",
  ];

  const now = new Date();

  return staticPaths.map((p) => ({
    url: `${base}/${p}`.replace(/\/+$/, "").replace(/(?<!:)\/{2,}/g, "/"),
    lastModified: now,
    changeFrequency: "weekly",
    priority: p === "" ? 1.0 : 0.7,
  }));
}
