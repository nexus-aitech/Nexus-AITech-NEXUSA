// webapp/src/app/robots.ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://www.nexus-aitech.net";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: ["/api/", "/admin", "/dashboard"],
      },
    ],
    sitemap: [`${base}/sitemap.xml`],
    host: base.replace(/^https?:\/\//, ""),
  };
}
