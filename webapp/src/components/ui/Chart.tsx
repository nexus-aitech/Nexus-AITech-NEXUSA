// webapp/src/components/ui/Chart.tsx
"use client";

import React, { useMemo, useState, useCallback, useEffect } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ReferenceArea,
  Brush,
} from "recharts";

/** =========================
 *  Types
 *  ========================= */
export type ChartPoint = { x: number | string; [seriesKey: string]: number | string | null };

export type ChartSeries = {
  key: string;                 // کلید ستون دیتا (مثلاً: "price", "signal")
  name?: string;               // نام قابل‌نمایش در Legend
  kind?: "line" | "area" | "bar";
  yAxis?: "left" | "right";    // سری روی کدام محور
  strokeWidth?: number;
  dot?: boolean;
  gradient?: boolean;          // فقط برای Area
  color?: string;              // CSS color (در صورت ندادن، از پالت پیش‌فرض)
};

export type RefLine = {
  y?: number;
  x?: number | string;
  label?: string;
  color?: string;
  axis?: "left" | "right";
  dashed?: boolean;
};

export type RefBand = {
  x1?: number | string; x2?: number | string;
  y1?: number; y2?: number;
  color?: string;             // مثلاً "rgba(16,185,129,.12)"
  label?: string;
};

export type ChartProps = {
  data: ChartPoint[];
  series: ChartSeries[];
  height?: number;                  // ارتفاع نمودار (px)
  grid?: boolean;                   // شبکه پس‌زمینه
  legend?: boolean;                 // نمایش Legend
  brush?: boolean;                  // محدوده انتخاب/زوم
  yLeftLabel?: string;
  yRightLabel?: string;
  xTickFormatter?: (v: any) => string;
  yLeftTickFormatter?: (v: number) => string;
  yRightTickFormatter?: (v: number) => string;
  refLines?: RefLine[];             // خطوط مرجع
  refBands?: RefBand[];             // ناحیه مرجع
  live?: boolean;                   // فعال‌سازی قلاب بروزرسانی زنده
  onLiveTick?: (lastX: any) => Promise<ChartPoint | null> | ChartPoint | null; // داده جدید بده
  liveIntervalMs?: number;          // فاصله زمانی بروزرسانی
};

/** =========================
 *  پیش‌فرض‌ها
 *  ========================= */
const PALETTE = [
  "#60a5fa", // blue-400
  "#22d3ee", // cyan-400
  "#a78bfa", // violet-400
  "#34d399", // emerald-400
  "#f472b6", // pink-400
  "#f59e0b", // amber-500
  "#fb7185", // rose-400
];

const DEFAULT_HEIGHT = 280;

/** Tooltip سفارشی */
function CustomTooltip({
  active,
  payload,
  label,
  xTickFormatter,
}: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-black/70 px-3 py-2 text-[12px] text-white shadow-xl backdrop-blur">
      <div className="mb-1 font-semibold">
        {xTickFormatter ? xTickFormatter(label) : String(label)}
      </div>
      <div className="space-y-0.5">
        {payload.map((p: any) => {
          const v = p.value;
          if (v === null || v === undefined) return null;
          return (
            <div key={p.dataKey} className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: p.color }}
              />
              <span className="opacity-80">{p.name || p.dataKey}:</span>
              <span className="font-medium">{typeof v === "number" ? v.toLocaleString() : v}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Legend قابل‌کلیک برای نمایش/مخفی‌سازی سری‌ها */
function renderLegend(props: any) {
  const { payload, onClick } = props;
  return (
    <div className="flex flex-wrap items-center gap-3 px-1 py-1 text-[12px]">
      {payload.map((entry: any) => (
        <button
          key={entry.value}
          onClick={() => onClick?.(entry)}
          className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-1 transition hover:bg-white/10"
          type="button"
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: entry.color, opacity: entry.inactive ? 0.3 : 1 }}
          />
          <span style={{ opacity: entry.inactive ? 0.5 : 1 }}>{entry.value}</span>
        </button>
      ))}
    </div>
  );
}

/** =========================
 *  Component
 *  ========================= */
export default function Chart({
  data,
  series,
  height = DEFAULT_HEIGHT,
  grid = true,
  legend = true,
  brush = true,
  yLeftLabel,
  yRightLabel,
  xTickFormatter,
  yLeftTickFormatter,
  yRightTickFormatter,
  refLines = [],
  refBands = [],
  live = false,
  onLiveTick,
  liveIntervalMs = 1500,
}: ChartProps) {
  // مرئی/نامرئی بودن هر سری
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  // ایندکس‌های انتخاب‌شده در Brush برای "زوم"
  const [range, setRange] = useState<{ startIndex?: number; endIndex?: number }>({});

  // داده‌ی نمایش‌داده‌شده بر اساس رنج انتخاب‌شده
  const viewData = useMemo(() => {
    if (range.startIndex == null || range.endIndex == null) return data;
    const s = Math.max(0, range.startIndex);
    const e = Math.min(data.length - 1, range.endIndex);
    return data.slice(s, e + 1);
  }, [data, range]);

  // رنگ هر سری رو با ثبات بده
  const colorOf = useCallback(
    (i: number, chosen?: string) => chosen || PALETTE[i % PALETTE.length],
    []
  );

  // کلیک روی Legend → نمایش/مخفی‌سازی
  const handleLegendClick = useCallback((entry: any) => {
    const key = entry.dataKey;
    setHidden((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Live update (اختیاری)
  useEffect(() => {
    if (!live || !onLiveTick) return;
    let timer: any = null;
    const tick = async () => {
      const last = data[data.length - 1]?.x;
      const newPoint = await onLiveTick(last);
      if (newPoint) {
        // توجه: کنترل state بیرون کامپوننت بهتره؛
        // اینجا فقط اطلاع می‌دیم که باید دیتا به‌روزرسانی بشه.
        // برای ساده‌سازی، هیچ setState داخلی نمی‌زنیم.
        // مصرف‌کننده باید با state خودش data را آپدیت کند.
        // (این الگو از re-rerender بی‌مورد جلوگیری می‌کند.)
      }
      timer = setTimeout(tick, liveIntervalMs);
    };
    timer = setTimeout(tick, liveIntervalMs);
    return () => clearTimeout(timer);
  }, [live, onLiveTick, data, liveIntervalMs]);

  // آیا محوری برای راست داریم؟
  const hasRightAxis = useMemo(() => series.some((s) => (s.yAxis || "left") === "right"), [series]);

  // Defs گرادیان برای Areaها
  const defs = useMemo(() => {
    return series
      .map((s, i) => {
        if (s.kind !== "area") return null;
        const id = `grad-${s.key}`;
        const base = colorOf(i, s.color);
        return (
          <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={base} stopOpacity={0.35} />
            <stop offset="100%" stopColor={base} stopOpacity={0.05} />
          </linearGradient>
        );
      })
      .filter(Boolean);
  }, [series, colorOf]);

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={viewData} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
          {/* Background grid */}
          {grid && (
            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
          )}

          {/* X Axis */}
          <XAxis
            dataKey="x"
            tick={{ fill: "rgba(255,255,255,.8)", fontSize: 12 }}
            tickLine={{ stroke: "rgba(255,255,255,.2)" }}
            axisLine={{ stroke: "rgba(255,255,255,.2)" }}
            tickFormatter={xTickFormatter}
            minTickGap={24}
          />

          {/* Y Left Axis */}
          <YAxis
            yAxisId="left"
            tick={{ fill: "rgba(255,255,255,.8)", fontSize: 12 }}
            tickLine={{ stroke: "rgba(255,255,255,.2)" }}
            axisLine={{ stroke: "rgba(255,255,255,.2)" }}
            tickFormatter={yLeftTickFormatter}
            label={
              yLeftLabel ? {
                value: yLeftLabel, angle: -90, position: "insideLeft",
                offset: -6, fill: "rgba(255,255,255,.7)", fontSize: 12,
              } : undefined
            }
          />

          {/* Y Right Axis (اختیاری) */}
          {hasRightAxis && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: "rgba(255,255,255,.8)", fontSize: 12 }}
              tickLine={{ stroke: "rgba(255,255,255,.2)" }}
              axisLine={{ stroke: "rgba(255,255,255,.2)" }}
              tickFormatter={yRightTickFormatter}
              label={
                yRightLabel ? {
                  value: yRightLabel, angle: 90, position: "insideRight",
                  offset: -6, fill: "rgba(255,255,255,.7)", fontSize: 12,
                } : undefined
              }
            />
          )}

          {/* Tooltip */}
          <Tooltip
            content={
              <CustomTooltip xTickFormatter={xTickFormatter} />
            }
          />

          {/* Legend قابل‌کلیک */}
          {legend && (
            <Legend
              verticalAlign="top"
              align="left"
              content={(p) =>
                renderLegend({
                  ...p,
                  onClick: (entry: any) => handleLegendClick(entry),
                  // علامت‌گذاری آیتم‌های مخفی
                  payload: p.payload?.map((it: any) => ({
                    ...it,
                    inactive: hidden[it.dataKey],
                  })),
                })
              }
            />
          )}

          {/* نواحی مرجع */}
          {refBands.map((b, idx) => (
            <ReferenceArea
              key={`band-${idx}`}
              x1={b.x1}
              x2={b.x2}
              y1={b.y1}
              y2={b.y2}
              strokeOpacity={0}
              fill={b.color || "rgba(59,130,246,.10)"} // آبی کم‌رنگ
            />
          ))}

          {/* خطوط مرجع */}
          {refLines.map((r, idx) => (
            <ReferenceLine
              key={`ref-${idx}`}
              yAxisId={r.axis === "right" ? "right" : "left"}
              y={r.y}
              x={r.x}
              stroke={r.color || "rgba(255,255,255,.35)"}
              strokeDasharray={r.dashed ? "4 4" : undefined}
              label={r.label ? { value: r.label, fill: "rgba(255,255,255,.7)", fontSize: 11 } : undefined}
            />
          ))}

          {/* گرادیان‌ها برای Area */}
          <defs>{defs}</defs>

          {/* سری‌ها */}
          {series.map((s, i) => {
            const common = {
              key: s.key,
              dataKey: s.key,
              name: s.name || s.key,
              stroke: colorOf(i, s.color),
              strokeWidth: s.strokeWidth ?? 2,
              dot: s.dot ?? false,
              hide: !!hidden[s.key],
              yAxisId: s.yAxis === "right" ? "right" : "left",
              isAnimationActive: false,
              connectNulls: true as const,
            };
            if (s.kind === "area") {
              const fillId = s.gradient ? `url(#grad-${s.key})` : colorOf(i, s.color);
              return <Area {...common} type="monotone" fill={fillId} fillOpacity={s.gradient ? 1 : 0.12} />;
            }
            if (s.kind === "bar") {
              return <Bar {...common} barSize={18} fill={colorOf(i, s.color)} />;
            }
            // default: line
            return <Line {...common} type="monotone" activeDot={{ r: 4 }} />;
          })}

          {/* Brush برای انتخاب بازه/زوم */}
          {brush && data.length > 20 && (
            <Brush
              dataKey="x"
              height={28}
              travellerWidth={8}
              stroke="rgba(255,255,255,.25)"
              fill="rgba(255,255,255,.04)"
              onChange={(r: any) => setRange({ startIndex: r?.startIndex, endIndex: r?.endIndex })}
              className="rounded-md overflow-hidden"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** =========================
 *  مثال استفاده (اختیاری)
 *  =========================
 *
 * const data = [
 *   { x: "09:00", price: 101, volume: 230, signal: 0.4 },
 *   { x: "09:05", price: 103, volume: 180, signal: 0.6 },
 *   ...
 * ];
 *
 * <Chart
 *   data={data}
 *   series={[
 *     { key: "price",  name: "Price",  kind: "line", strokeWidth: 2 },
 *     { key: "signal", name: "Signal", kind: "area", gradient: true, yAxis: "right" },
 *     { key: "volume", name: "Volume", kind: "bar",   yAxis: "right" },
 *   ]}
 *   yLeftLabel="Price"
 *   yRightLabel="Signal / Volume"
 *   xTickFormatter={(v) => String(v)}
 *   yLeftTickFormatter={(v) => v.toFixed(2)}
 *   yRightTickFormatter={(v) => v.toLocaleString()}
 *   refLines={[
 *     { y: 100, label: "Baseline 100", color: "rgba(234,179,8,.8)", dashed: true },
 *   ]}
 *   refBands={[
 *     { x1: "09:30", x2: "10:00", color: "rgba(16,185,129,.12)", label: "Session A" },
 *   ]}
 *   brush
 *   legend
 *   grid
 * />
 *
 * نکتهٔ Live:
 * - اگر می‌خواهی دیتا به‌صورت زنده آپدیت شود، state دیتا را در والد نگه دار و
 *   در onLiveTick دادهٔ جدید تولید/دریافت کن و به state اضافه کن.
 * - این کامپوننت برای مدیریت رندر بهینه، خودش state دیتا را تغییر نمی‌دهد.
 */

