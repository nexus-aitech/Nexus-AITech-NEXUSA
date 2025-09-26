"use client";
import React, { useEffect, useState } from "react";
import { motion, useAnimation } from "framer-motion";
import { cn } from "@/lib/utils";
import { TrendingUp, Users, Clock, Zap } from "lucide-react";

export type StatVariant = "default" | "success" | "warning" | "danger" | "info";

export interface StatProps {
  value: number;
  label: string;
  suffix?: string; // e.g. %, h, +
  icon?: React.ReactNode;
  variant?: StatVariant;
  duration?: number; // animation duration
  className?: string;
}

const variantStyles: Record<StatVariant, string> = {
  default: "text-white",
  success: "text-green-400",
  warning: "text-yellow-400",
  danger: "text-red-400",
  info: "text-blue-400",
};

// Some default icons if user doesn’t pass one
const defaultIcons: React.ReactNode[] = [
  <TrendingUp key="t" className="h-4 w-4"/>,
  <Users key="u" className="h-4 w-4"/>,
  <Clock key="c" className="h-4 w-4"/>,
  <Zap key="z" className="h-4 w-4"/>,
];

export function Stat({
  value,
  label,
  suffix = "",
  icon,
  variant = "default",
  duration = 1.2,
  className
}: StatProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const controls = useAnimation();

  useEffect(() => {
    controls.start({ count: value, transition: { duration, ease: "easeOut" } });
  }, [value, duration, controls]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-inner backdrop-blur-xl",
        className
      )}
    >
      <motion.div
        initial={{ count: 0 }}
        animate={controls}
      >
        {(latest: any) => (
          <div className={cn("flex items-center gap-2 text-3xl font-extrabold", variantStyles[variant])}>
            {icon || defaultIcons[Math.floor(Math.random() * defaultIcons.length)]}
            {Math.floor(latest.count)}{suffix}
          </div>
        )}
      </motion.div>
      <p className="mt-1 text-xs text-white/60">{label}</p>
    </motion.div>
  );
}
