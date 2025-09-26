import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { ReactNode } from "react";

// ---- Brand/site config (safe fallbacks) ----
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://nexus-aitech.net";
const APP_NAME = "NEXUSA";
const APP_DESC = "AI‑first, Web3‑native platform for live data, signals, backtesting, and automation.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${APP_NAME} – AI • Web3 • Real‑time` ,
    template: `%s – ${APP_NAME}`,
  },
  description: APP_DESC,
  keywords: ["NEXUSA","AI","Web3","Backtesting","Trading","Automation","Crypto","DeFi"],
  applicationName: APP_NAME,
  alternates: {
    canonical: SITE_URL,
    languages: {
      "en": `${SITE_URL}/`,
      "fa": `${SITE_URL}/fa/`,
    },
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    title: `${APP_NAME} – AI • Web3 • Real‑time`,
    description: APP_DESC,
    siteName: APP_NAME,
    images: [{ url: "/og/Nexus-AITech-og.png", width: 1200, height: 630, alt: `${APP_NAME} Open Graph` }],
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} – AI • Web3 • Real‑time`,
    description: APP_DESC,
    creator: "@NexusAITech",
    images: ["/og/Nexus-AITech-og.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    other: [{ rel: "mask-icon", url: "/icons/safari-pinned-tab.svg", color: "#0b1220" }],
  },
  manifest: "/site.webmanifest",
  category: "finance",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0F13" },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

// ---- Theme bootstrap (no external deps) ----
// Reads `theme` from localStorage ("light" | "dark" | "system") and sets <html> class early to avoid FOUC
const THEME_BOOTSTRAP = `(() => {
  try {
    const pref = localStorage.getItem('theme') || 'system';
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = pref === 'dark' || (pref === 'system' && sysDark);
    const cls = document.documentElement.classList;
    if (isDark) cls.add('dark'); else cls.remove('dark');
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  } catch (_) {}
})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        {/* Early theme to avoid flashing */}
        <Script id="theme-bootstrap" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        {/* JSON-LD Organization (SEO) */}
        <Script id="org-jsonld" type="application/ld+json" strategy="afterInteractive" dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: APP_NAME,
            url: SITE_URL,
            sameAs: [
              "https://twitter.com/NexusAITech",
              "https://t.me/NexusAITech2025",
              "https://www.linkedin.com/company/nexus-aitech"
            ],
            contactPoint: [{
              "@type": "ContactPoint",
              contactType: "customer support",
              email: "nexusaitech8@gmail.com"
            }]
          })
        }} />
      </head>
      <body className="bg-background text-foreground antialiased">
        {/* Optional: top notice for staging environments */}
        {process.env.NEXT_PUBLIC_STAGE === 'staging' && (
          <div className="w-full bg-yellow-500/10 border-b border-yellow-500/30 text-yellow-200 text-xs py-1 text-center">
            Staging environment
          </div>
        )}

        {/* App shell: place your global nav/footer here if available */}
        <div id="__app" className="min-h-dvh flex flex-col">
          {/* <SiteNav /> */}
          <main className="flex-1">{children}</main>
          {/* <SiteFooter /> */}
        </div>

        {/* Cookie/consent minimal banner (non-blocking). Replace with your CMP if needed. */}
        <Script id="consent-autoset" strategy="afterInteractive">{`
          try {
            const k = 'nx_consent';
            if (!localStorage.getItem(k)) {
              const bar = document.createElement('div');
              bar.style.cssText = 'position:fixed;inset:auto 0 0 0;z-index:50;display:flex;gap:8px;align-items:center;justify-content:center;padding:10px 12px;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);color:#fff;font:12px/1.3 ui-sans-serif,system-ui;';
              bar.innerHTML = 'We use cookies for analytics and essential features. <button id="nx_accept" style="margin-left:8px;padding:6px 10px;border-radius:999px;background:#3b82f6;color:#fff;border:0;cursor:pointer">OK</button>';
              document.body.appendChild(bar);
              bar.querySelector('#nx_accept')?.addEventListener('click', () => { localStorage.setItem(k, '1'); bar.remove(); });
            }
          } catch(_) {}
        `}</Script>

        {/* Optional analytics hooks (add integrations as you prefer) */}
        {/* <Analytics /> */}
      </body>
    </html>
  );
}
