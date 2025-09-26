"use client";
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type ProgressVariant = "primary" | "success" | "warning" | "danger" | "info";

export interface ProgressBarProps {
  value: number; // 0 - 100
  label?: string;
  showPercent?: boolean;
  striped?: boolean;
  animated?: boolean;
  variant?: ProgressVariant;
  height?: "sm" | "md" | "lg";
  className?: string;
}

const variantColors: Record<ProgressVariant, string> = {
  primary: "bg-indigo-500",
  success: "bg-green-500",
  warning: "bg-yellow-400",
  danger: "bg-red-500",
  info: "bg-blue-400",
};

const heightClasses = {
  sm: "h-2",
  md: "h-3",
  lg: "h-4",
};

export function ProgressBar({
  value,
  label,
  showPercent = true,
  striped = false,
  animated = false,
  variant = "primary",
  height = "md",
  className,
}: ProgressBarProps) {
  const safeValue = Math.min(100, Math.max(0, value));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    // animate from 0 to value smoothly
    const timer = setTimeout(() => setDisplay(safeValue), 50);
    return () => clearTimeout(timer);
  }, [safeValue]);

  return (
    <div className={cn("w-full space-y-1", className)}>
      {label && <div className="text-xs font-medium text-white/70">{label}</div>}
      <div className={cn("w-full overflow-hidden rounded-full bg-white/10", heightClasses[height])}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${display}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className={cn(
            "h-full rounded-full transition-all",
            variantColors[variant],
            striped && "bg-[linear-gradient(45deg,rgba(255,255,255,0.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.2)_75%,transparent_75%,transparent)] bg-[length:1rem_1rem]",
            animated && "animate-[progress-stripes_1s_linear_infinite]"
          )}
        />
      </div>
      {showPercent && (
        <div className="text-right text-xs tabular-nums text-white/60">{safeValue}%</div>
      )}
    </div>
  );
}

// CSS keyframes for animated stripes (global)
// Add to globals.css if not already defined:
// @keyframes progress-stripes { from { background-position: 1rem 0; } to { background-position: 0 0; } }
