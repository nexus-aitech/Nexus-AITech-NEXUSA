"use client";

import { Card } from "@/components/ui/Card";
import React from "react";
import type { Metadata } from "next";

// ───────────────────────────────────────────────────────────────────────────────
// SEO / Metadata (App Router)
// ───────────────────────────────────────────────────────────────────────────────
const siteUrl = "https://www.Nexus-AITech.net";
export const metadata: Metadata = {
  title: "Nexus-AITech (NEXUSA) – درباره ما",
  description:
    "Nexus-AITech یک اکوسیستم Web3 کاملاً خودمختار و مجهز به هوش مصنوعی است که امنیت بلاکچین، پردازش داده و اپلیکیشن‌های غیرمتمرکز را متحول می‌کند.",
  metadataBase: new URL(siteUrl),
  applicationName: "Nexus-AITech (NEXUSA)",
  authors: [{ name: "Nexus-AITech Team" }],
  keywords: [
    "Nexus-AITech",
    "NEXUSA",
    "Web3",
    "AI",
    "Blockchain",
    "DeFi",
    "Cybersecurity",
    "Multi-chain",
    "Arbitrum",
    "Ethereum",
    "Solana",
  ],
  category: "technology",
  alternates: { canonical: "/about" },
  openGraph: {
    type: "website",
    url: `${siteUrl}/about`,
    siteName: "Nexus-AITech (NEXUSA)",
    title: "Nexus-AITech (NEXUSA) – درباره ما",
    description:
      "اکوسیستم Web3 هوشمند و خودتکاملی که با زیرساخت چندزنجیره‌ای و هوش مصنوعی، امنیت، تحلیل و سرویس‌های غیرمتمرکز را یکپارچه می‌کند.",
    images: [
      {
        url: `${siteUrl}/og.jpg`,
        width: 1200,
        height: 630,
        alt: "Nexus-AITech (NEXUSA)",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@NexusAITech2025",
    creator: "@NexusAITech2025",
    title: "Nexus-AITech (NEXUSA) – درباره ما",
    description:
      "Web3 + AI چندزنجیره‌ای: امنیت، تحلیل DeFi و سرویس‌های غیرمتمرکز با کمترین دخالت انسانی.",
    images: [`${siteUrl}/og.jpg`],
  },
  robots: { index: true, follow: true },
};

// اختیاری: فعال‌سازی ISR (اگر در پروژه‌تان استفاده می‌کنید)
export const revalidate = 60 * 60; // هر ۱ ساعت

// ───────────────────────────────────────────────────────────────────────────────
// لینک‌ها و شبکه‌های اجتماعی
// ───────────────────────────────────────────────────────────────────────────────
const LINKS = {
  website: siteUrl,
  email: "mailto:nexusaitech8@gmail.com",
  social: {
    discord: "https://discord.com/invite/nexusaitech2025", // TODO: لینک دعوت رسمی را جایگزین کنید
    telegram: "https://t.me/NexusAITech2025",
    twitter: "https://x.com/NexusAITech2025", // X (Twitter)
    reddit: "https://www.reddit.com/r/Nexusaitech2025", // TODO: در صورت تفاوت، لینک صحیح را جایگزین کنید
    linkedin: "https://www.linkedin.com/in/nexus-aitech", // اگر صفحه سازمانی دارید: /company/<slug>
    instagram: "https://instagram.com/Nexusaitech2025",
    tiktok: "https://www.tiktok.com/@Nexusaitech2025",
  },
} as const;

// ───────────────────────────────────────────────────────────────────────────────
// کامپوننت‌های کمکی UI
// ───────────────────────────────────────────────────────────────────────────────
function Section({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur p-6 space-y-4 ${className}`}
    >
      <h2 className="text-xl font-bold text-white">{title}</h2>
      <div className="prose prose-invert prose-sm leading-7 max-w-none rtl:text-right">
        {children}
      </div>
    </section>
  );
}

function SocialButton({
  label,
  href,
  className = "",
  children,
}: {
  label: string;
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="me noopener noreferrer"
      title={label}
      aria-label={label}
      className={`group flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm transition
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 hover:shadow-md hover:-translate-y-[2px] ${className}`}
    >
      <span className="sr-only">{label}</span>
      <div className="w-7 h-7 transition-transform duration-200 group-hover:scale-110">{children}</div>
    </a>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// آیکون‌های SVG با رنگ جریان‌یافته از کلاس والد (currentColor)
// ───────────────────────────────────────────────────────────────────────────────
const Icons = {
  Discord: (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" className="w-full h-full">
      <path d="M20.317 4.369A18.06 18.06 0 0016.558 3c-.2.36-.432.85-.592 1.234a16.1 16.1 0 00-7.932 0A7.14 7.14 0 007.442 3C6.26 3.274 5.14 3.71 4.05 4.369 1.95 7.57 1.27 10.69 1.5 13.77c1.7 1.27 3.34 2.04 4.94 2.54.4-.55.76-1.13 1.08-1.74-.6-.23-1.17-.51-1.71-.84.14-.11.28-.22.42-.33 3.29 1.54 6.85 1.54 10.1 0 .14.11.28.22.42.33-.54.33-1.11.61-1.71.84.32.61.68 1.19 1.08 1.74 1.6-.5 3.24-1.27 4.94-2.54.24-3.12-.4-6.24-2.46-9.401zM9.7 12.9c-.79 0-1.44-.73-1.44-1.63 0-.9.64-1.63 1.44-1.63s1.45.73 1.45 1.63-.65 1.63-1.45 1.63zm4.6 0c-.79 0-1.44-.73-1.44-1.63 0-.9.64-1.63 1.44-1.63s1.45.73 1.45 1.63-.66 1.63-1.45 1.63z"/>
    </svg>
  ),
  Telegram: (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" className="w-full h-full">
      <path d="M9.036 15.803l-.35 4.93c.5 0 .71-.21.97-.46l2.33-2.24 4.83 3.54c.89.49 1.53.23 1.78-.82l3.22-14.99h.01c.29-1.34-.48-1.86-1.34-1.54L1.42 9.78c-1.3.5-1.28 1.21-.22 1.53l4.85 1.52 11.26-7.1c.53-.33 1.02-.15.62.18l-9.89 9.91z"/>
    </svg>
  ),
  X: (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" className="w-full h-full" aria-hidden="true">
      <path d="M18.244 2H21l-6.53 7.46L22 22h-6.938l-4.845-6.33L4.7 22H2l7.09-8.102L2 2h6.938l4.52 6.02L18.244 2zm-2.43 18h1.746L8.27 4H6.42l9.394 16z"/>
    </svg>
  ),
  Reddit: (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" className="w-full h-full">
      <path d="M22 12.5c0-1.2-.98-2.18-2.18-2.18-.56 0-1.07.21-1.45.56-1.35-.86-3.2-1.41-5.23-1.48l.89-4.18 2.9.62a1.64 1.64 0 103.2-.67 1.64 1.64 0 00-3.16.73l-3.4-.73c-.24-.05-.47.1-.52.34l-1 4.67c-2 .08-3.81.63-5.15 1.48a2.18 2.18 0 00-1.46-.56A2.18 2.18 0 002 12.5c0 .87.5 1.61 1.23 1.96-.03.2-.04.41-.04.62 0 3.02 3.58 5.47 8 5.47s8-2.45 8-5.47c0-.21-.01-.42-.04-.62.73-.35 1.23-1.09 1.23-1.96zM8.75 13.25a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm6.5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM12 19.17c-1.87 0-3.5-.67-4.44-1.67a.5.5 0 01.73-.68c.75.8 2.06 1.35 3.71 1.35s2.96-.55 3.71-1.35a.5.5 0 11.73.68c-.94 1-2.57 1.67-4.44 1.67z"/>
    </svg>
  ),
  LinkedIn: (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" className="w-full h-full">
      <path d="M4.98 3.5A2.5 2.5 0 112.5 6a2.5 2.5 0 012.48-2.5zM3 8.5h4v12H3v-12zM9 8.5h3.8v1.64h.05c.53-.95 1.83-1.95 3.77-1.95 4.03 0 4.77 2.65 4.77 6.1v6.21h-4v-5.51c0-1.31-.02-3-1.83-3-1.83 0-2.11 1.43-2.11 2.9v5.61H9v-12z"/>
    </svg>
  ),
  Instagram: (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" className="w-full h-full">
      <path d="M7 2h10a5 5 0 015 5v10a5 5 0 01-5 5H7a5 5 0 01-5-5V7a5 5 0 015-5zm0 2a3 3 0 00-3 3v10a3 3 0 003 3h10a3 3 0 003-3V7a3 3 0 00-3-3H7zm5 3.5A5.5 5.5 0 1112 18a5.5 5.5 0 010-11zm0 2A3.5 3.5 0 1015.5 13 3.5 3.5 0 0012 9.5zM18 6.8a1.2 1.2 0 11-1.2-1.2A1.2 1.2 0 0118 6.8z"/>
    </svg>
  ),
  TikTok: (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" className="w-full h-full">
      <path d="M21 8.5a6.5 6.5 0 01-5.5-5.4V3H12v11.2a2.7 2.7 0 11-2-2.6V8.35A6.2 6.2 0 006 8a6 6 0 106 6V8.8c1.5 1.3 3.2 2 5 2h.02V8.5z"/>
    </svg>
  ),
} as const;

// ───────────────────────────────────────────────────────────────────────────────
// صفحه About
// ───────────────────────────────────────────────────────────────────────────────
export default function AboutPage() {
  // JSON-LD: Organization
  const organizationLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Nexus-AITech (NEXUSA)",
    url: LINKS.website,
    email: LINKS.email.replace("mailto:", ""),
    sameAs: [
      LINKS.social.discord,
      LINKS.social.telegram,
      LINKS.social.twitter,
      LINKS.social.reddit,
      LINKS.social.linkedin,
      LINKS.social.instagram,
      LINKS.social.tiktok,
    ],
  };

  return (
    <div dir="rtl" className="relative">
      {/* پس‌زمینهٔ دکوراتیو */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60rem_40rem_at_80%_-10%,rgba(76,29,149,0.35),transparent),radial-gradient(50rem_35rem_at_-10%_20%,rgba(2,132,199,0.25),transparent)]"
      />

      <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <header className="space-y-4">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white">
            Nexus-AITech <span className="text-white/60">(NEXUSA)</span>
          </h1>
          <p className="text-white/70 max-w-3xl leading-7">
            یک اکوسیستم کاملاً خودمختار و مجهز به هوش مصنوعی در حوزه Web3 که با هدف
            متحول‌کردن امنیت بلاکچین، پردازش داده و اپلیکیشن‌های غیرمتمرکز توسعه یافته است.
          </p>
        </header>

        {/* مقدمه */}
        <Section title="مقدمه">
          <p>
            <strong>Nexus-AITech</strong> یک اکوسیستم کاملاً خودمختار و مبتنی بر هوش مصنوعی در حوزه{" "}
            <strong>Web3</strong> است که با هدف ایجاد تحول در امنیت بلاکچین، پردازش داده و اپلیکیشن‌های
            غیرمتمرکز طراحی شده است. با ادغام فناوری‌های پیشرفتهٔ هوش مصنوعی و زیرساخت چندزنجیره‌ای،
            به دنبال ایجاد شبکه‌ای <strong>هوشمند، خودتکاملی و بسیار کارآمد</strong> هستیم که نیاز به دخالت انسانی
            را به حداقل می‌رساند.
          </p>
          <p>
            این شبکه به‌صورت یکپارچه با <strong>هفت بلاکچین اصلی</strong> شامل اتریوم، بایننس اسمارت چین، سولانا، پولکادات،
            کاردانو، آوالانچ و آربیتروم ادغام می‌شود تا خدمات{" "}
            <strong>امنیت سایبری لحظه‌ای، تحلیل DeFi، بهینه‌سازی تراکنش‌ها و سرویس‌های غیرمتمرکز مبتنی بر هوش مصنوعی</strong>{" "}
            را ارائه دهد.
          </p>
          <p>
            <strong>Nexus-AITech</strong> فقط یک پروژهٔ دیگر در بلاکچین نیست—بلکه{" "}
            <strong>نسل بعدی اکوسیستم‌های Web3 مبتنی بر هوش مصنوعی</strong> است!
          </p>
        </Section>

        {/* چشم‌انداز / مأموریت / ارزش‌ها */}
        <div className="grid md:grid-cols-3 gap-4">
          <Section title="چشم‌انداز ما">
            <p>
              چشم‌انداز ما افزایش آزادی پول در سطح جهانی است. باور داریم با گسترش این آزادی
              می‌توان زندگی مردم سراسر جهان را به شکل چشمگیری بهبود بخشید.
            </p>
          </Section>
          <Section title="ماموریت ما">
            <p>ماموریت ما ارائهٔ خدمات زیرساختی اصلی برای سازمان‌دهی دنیای کریپتو است.</p>
          </Section>
          <Section title="ارزش‌های ما">
            <p>
              ارزش‌های بنیادین <strong>Nexus-AITech</strong> راهنمای رفتارها، تصمیم‌ها و اقدامات ما هستند و امکان
              همکاری یکپارچه میان تیم‌های متنوع و بین‌المللی را فراهم می‌کنند.
            </p>
          </Section>
        </div>

        {/* دعوت به جامعه */}
        <Section title="به جامعه Nexus-AITech بپیوندید">
          <p>
            <strong>Nexus-AITech</strong> فراتر از یک اکوسیستم کریپتوست؛ یک جامعهٔ جهانی پویا که توسط کاربران
            از تمامی اقشار شکل گرفته است. کاربران ما در دنیای واقعی و فضای آنلاین گرد هم می‌آیند تا
            علایق مشترک‌شان را دنبال کرده و به پیشبرد دنیای کریپتو کمک کنند.
          </p>
          <p>
            این جامعه هر روز الهام‌بخش ماست؛ موتور نوآوری <strong>Nexus-AITech</strong> که ما را برای دستیابی
            به اهدافی بزرگ‌تر یاری و انگیزه می‌دهد. هیچ چیز برای ما لذت‌بخش‌تر از دیدار و گفت‌وگو با
            اعضای جامعه—چه آنلاین و چه حضوری—نیست.
          </p>
          <p>
            <strong>الیاس</strong>
          </p>
        </Section>

        {/* دعوت به گفتگو */}
        <Section title="به گفتگو بپیوندید">
          <p>
            گروه رسمی تلگرام <strong>Nexus-AITech</strong> مکانی برای گفت‌وگو دربارهٔ موضوعات گوناگون است؛ از
            معاملات و NFT گرفته تا اطلاعیه‌های پلتفرم و موارد دیگر. البته حضور ما محدود به تلگرام نیست—
            برای دریافت تازه‌ترین اخبار، به‌روزرسانی‌ها و میم‌های کریپتویی، ما را در پلتفرم‌های اجتماعی نیز دنبال کنید.
          </p>
        </Section>

        {/* کانال‌های اجتماعی با آیکون و لینک */}
        <Section title="کانال‌های رسانه‌های اجتماعی Nexus-AITech">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-3">
            <SocialButton
              label="Discord"
              href={LINKS.social.discord}
              className="text-[#5865F2] hover:bg-[#5865F2]/10"
            >
              {Icons.Discord}
            </SocialButton>
            <SocialButton
              label="Telegram"
              href={LINKS.social.telegram}
              className="text-[#26A5E4] hover:bg-[#26A5E4]/10"
            >
              {Icons.Telegram}
            </SocialButton>
            <SocialButton
              label="X (Twitter)"
              href={LINKS.social.twitter}
              className="text-[#1D9BF0] hover:bg-[#1D9BF0]/10"
            >
              {Icons.X}
            </SocialButton>
            <SocialButton
              label="Reddit"
              href={LINKS.social.reddit}
              className="text-[#FF4500] hover:bg-[#FF4500]/10"
            >
              {Icons.Reddit}
            </SocialButton>
            <SocialButton
              label="LinkedIn"
              href={LINKS.social.linkedin}
              className="text-[#0A66C2] hover:bg-[#0A66C2]/10"
            >
              {Icons.LinkedIn}
            </SocialButton>
            <SocialButton
              label="Instagram"
              href={LINKS.social.instagram}
              className="bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white hover:opacity-90"
            >
              {Icons.Instagram}
            </SocialButton>
            <SocialButton
              label="TikTok"
              href={LINKS.social.tiktok}
              className="text-black bg-white hover:bg-white/90 dark:text-white dark:bg-black dark:hover:bg-black/80"
            >
              {Icons.TikTok}
            </SocialButton>
          </div>

          <div className="mt-4 text-xs text-white/60 space-y-1">
            <p>
              <strong>وب‌سایت:</strong>{" "}
              <a className="underline" href={LINKS.website} target="_blank" rel="noreferrer">
                {LINKS.website}
              </a>
            </p>
            <p>
              <strong>ایمیل:</strong>{" "}
              <a className="underline" href={LINKS.email}>
                {LINKS.email.replace("mailto:", "")}
              </a>
            </p>
          </div>

          {/* توضیحات همخوانی با فایل PDF و TODOها */}
          <div className="mt-4 rounded-xl border border-white/10 p-3 text-xs text-white/50 space-y-1">
            <p>موارد زیر مطابق داده‌های موجود درج شده‌اند؛ در صورت داشتن لینک‌های رسمی جدید، جایگزین کنید:</p>
            <ul className="list-disc ps-6 space-y-1">
              <li>Telegram: https://t.me/NexusAITech2025</li>
              <li>X (Twitter): https://x.com/NexusAITech2025</li>
              <li>LinkedIn: https://www.linkedin.com/in/nexus-aitech</li>
              <li>Instagram: https://instagram.com/Nexusaitech2025</li>
              <li>TikTok: https://www.tiktok.com/@Nexusaitech2025</li>
              <li>Reddit (در صورت Subreddit بودن): https://www.reddit.com/r/Nexusaitech2025</li>
              <li>Discord (نیازمند دعوت‌نامهٔ معتبر): https://discord.com/invite/nexusaitech2025</li>
              <li>ایمیل: nexusaitech8@gmail.com</li>
              <li>وب‌سایت: https://www.Nexus-AITech.net</li>
            </ul>
          </div>
        </Section>

        {/* جمع‌بندی */}
        <Section title="جمع‌بندی">
          <p>
            <strong>Nexus-AITech</strong> با تکیه بر هوش مصنوعی و زیرساخت چندزنجیره‌ای، بستر یکپارچه‌ای
            برای امنیت، تحلیل و سرویس‌های غیرمتمرکز فراهم می‌کند و جامعهٔ قدرتمندی از کاربران و سرمایه‌گذاران
            پیرامون خود شکل می‌دهد.
          </p>
        </Section>
      </main>

      {/* JSON-LD (Organization) برای SEO ساختاریافته */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd) }}
      />
    </div>
  );
}
