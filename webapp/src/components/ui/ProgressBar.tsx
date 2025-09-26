"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function ProgressBar({ value, max = 100, className }: { value: number; max?: number; className?: string }) {
  return (
    <div className={cn("relative w-full h-3 bg-muted rounded-full overflow-hidden", className)}>
      <div
        className="h-full bg-primary transition-all"
        style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
      />
    </div>
  );
}
