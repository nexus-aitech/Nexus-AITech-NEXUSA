// webapp/src/components/branding/Logo.tsx
// SVG برند NEXUSA — سبک، مقیاس‌پذیر، و قابل‌استفاده در هدر/فوتر
// Variantها: mark (آیکن)، wordmark (متن)، full (آیکن+متن)

import * as React from "react";
import Link from "next/link";

export type LogoVariant = "full" | "mark" | "wordmark";

export interface LogoProps {
  variant?: LogoVariant;
  className?: string;
  size?: number; // پیکسل — ارتفاع آیکن برای mark/full
  label?: string; // برای دسترس‌پذیری
  href?: string; // اگر بدهید، لوگو لینک می‌شود
}

export function Logo({ variant = "full", className = "", size = 28, label = "NEXUSA", href }: LogoProps) {
  const content = (
    <span className={"inline-flex items-center gap-2 " + className}>
      <LogoMark size={size} />
      {variant !== "mark" && (
        <span className="select-none font-black tracking-widest text-white" style={{ letterSpacing: "0.18em" }}>
          NEXUSA
        </span>
      )}
    </span>
  );

  if (variant === "wordmark") {
    return (
      <span className={"inline-flex items-center " + className}>
        <span className="select-none font-black tracking-widest text-white" style={{ letterSpacing: "0.18em" }}>
          NEXUSA
        </span>
      </span>
    );
  }

  if (href) {
    return (
      <Link href={href} aria-label={label} className="inline-block">
        {content}
      </Link>
    );
  }

  return content;
}

export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  const gid = React.useId().replace(/:/g, "");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={`g-${gid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#60a5fa" />
        </linearGradient>
        <radialGradient id={`r-${gid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`beam-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.0" />
          <stop offset="40%" stopColor="#93c5fd" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {/* outer ring */}
      <circle cx="32" cy="32" r="23" fill="none" stroke={`url(#g-${gid})`} strokeWidth="2.25" />

      {/* inner dashed ring */}
      <circle
        cx="32"
        cy="32"
        r="14"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1.25"
        strokeDasharray="2.5 3.5"
        strokeLinecap="round"
      />

      {/* crosshair */}
      <path
        d="M32 6v10 M32 48v10 M6 32h10 M48 32h10"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeLinecap="round"
      />

      {/* vertical beam */}
      <rect x="31.2" y="10" width="1.6" height="44" fill={`url(#beam-${gid})`} />

      {/* core */}
      <circle cx="32" cy="32" r="3.5" fill={`url(#r-${gid})`} />
    </svg>
  );
}

export default Logo;
