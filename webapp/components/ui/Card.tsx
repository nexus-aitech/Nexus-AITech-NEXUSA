import React from "react";

export function Card({
  title,
  children,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5">
      <div className="font-semibold text-white">{title}</div>
      <div className="mt-3 text-white/80 text-sm leading-6">{children}</div>
      {footer && <div className="mt-4">{footer}</div>}
    </div>
  );
}

export default Card;
