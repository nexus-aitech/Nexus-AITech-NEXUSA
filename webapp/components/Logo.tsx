export function Logo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="NEXUSA Logo"
    >
      <rect x="2" y="2" width="60" height="60" rx="14" className="fill-slate-900" />
      <path
        d="M18 44V20l28 24V20"
        className="stroke-white"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

