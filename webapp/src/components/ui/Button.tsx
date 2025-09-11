import Link from "next/link";
import React from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  href?: string | URL;
  disabled?: boolean;
};

function cx(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Primary({ href, children, className = "", disabled, ...rest }: Props) {
  const base =
    "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold " +
    "bg-indigo-500 hover:bg-indigo-400 text-white transition";
  const cls = cx(base, disabled && "opacity-50 pointer-events-none", className);

  if (href) {
    // لینکِ غیرفعال: کلیک‌ناپذیر و با نشانه‌ی دسترس‌پذیری
    if (disabled) return <span className={cls} aria-disabled="true">{children}</span>;
    return <Link href={href} className={cls}>{children}</Link>;
  }

  // type پیش‌فرض: button (قابل override با rest.type)
  return (
    <button type="button" className={cls} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}

export function Ghost({ href, children, className = "", disabled, ...rest }: Props) {
  const base =
    "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold " +
    "bg-white/10 hover:bg-white/15 text-white transition";
  const cls = cx(base, disabled && "opacity-50 pointer-events-none", className);

  if (href) {
    if (disabled) return <span className={cls} aria-disabled="true">{children}</span>;
    return <Link href={href} className={cls}>{children}</Link>;
  }

  return (
    <button type="button" className={cls} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}
