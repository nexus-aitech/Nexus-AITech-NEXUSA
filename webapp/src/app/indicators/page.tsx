"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Activity,
  Atom,
  BadgeCheck,
  BookOpen,
  Check,
  ChevronDown,
  Cpu,
  Equal,
  Filter,
  Info,
  Layers,
  LineChart,
  Ruler,
  Save,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Upload,
} from "lucide-react";

/**
 * Nexus‑AITech — Indicators Catalog (Launch‑ready)
 *
 * Goals:
 *  - World‑class UX on top of real indicators: ADX, ATR, Ichimoku, OBV, StochRSI, VWAP
 *  - Client‑side state with URL + localStorage persistence (shareable & durable)
 *  - A11y complete, keyboard‑first, high‑contrast dark UI
 *  - Edge‑safe (no blocking), graceful fallbacks, optimistic save
 *  - Extensible: per‑indicator param schema, validation with zod
 */

// ───────────────────────────────────────────────────────────────────────────────
// 1) Indicator registry
// ───────────────────────────────────────────────────────────────────────────────

const IndicatorId = z.enum(["adx", "atr", "ichimoku", "obv", "stochrsi", "vwap"]);
export type IndicatorId = z.infer<typeof IndicatorId>;

// Per‑indicator parameter schemas
const ADXParams = z.object({ period: z.number().int().min(3).max(100).default(14), method: z.enum(["wilder", "ema", "sma"]).default("wilder") });
const ATRParams = z.object({ period: z.number().int().min(2).max(100).default(14), method: z.enum(["wilder", "ema", "sma"]).default("wilder"), bandsK: z.number().min(0).max(10).default(0) });
const IchimokuParams = z.object({ tenkan: z.number().int().min(2).max(60).default(9), kijun: z.number().int().min(2).max(120).default(26), senkouB: z.number().int().min(2).max(200).default(52), disp: z.number().int().min(0).max(120).default(26), shifted: z.boolean().default(true) });
const OBVParams = z.object({ smooth: z.enum(["none", "sma", "ema"]).default("none"), smoothPeriod: z.number().int().min(1).max(200).default(14), source: z.enum(["close", "hl2", "ohlc4", "ha"]).default("close") });
const StochRSIParams = z.object({ rsiPeriod: z.number().int().min(3).max(200).default(14), kPeriod: z.number().int().min(1).max(200).default(14), dPeriod: z.number().int().min(1).max(200).default(3), avg: z.enum(["sma", "ema", "wma", "hma", "kama"]).default("sma"), scale: z.enum(["0_1", "0_100"]).default("0_100") });
const VWAPParams = z.object({ anchor: z.enum(["session", "day", "week", "month", "ytd"]).default("session"), bands: z.enum(["none", "stdev", "mad"]).default("stdev"), k: z.number().min(0).max(5).default(2) });

const INDICATOR_DEFS: Record<IndicatorId, {
  id: IndicatorId;
  name: string;
  short: string;
  icon: React.ReactNode;
  tags: string[];
  schema: z.ZodTypeAny;
  defaults: Record<string, unknown>;
  doc: string;
}> = {
  adx: {
    id: "adx",
    name: "ADX",
    short: "Average Directional Index",
    icon: <Activity className="h-4 w-4" aria-hidden />,
    tags: ["trend", "momentum", "wilder"],
    schema: ADXParams,
    defaults: ADXParams.parse({}),
    doc: "Trend strength via +DI/−DI with Wilder/EMA/SMA smoothing.",
  },
  atr: {
    id: "atr",
    name: "ATR",
    short: "Average True Range",
    icon: <Ruler className="h-4 w-4" aria-hidden />,
    tags: ["volatility", "risk"],
    schema: ATRParams,
    defaults: ATRParams.parse({}),
    doc: "Volatility gauge; optional bands ±k·ATR.",
  },
  ichimoku: {
    id: "ichimoku",
    name: "Ichimoku Cloud",
    short: "Cloud trend + momentum",
    icon: <Layers className="h-4 w-4" aria-hidden />,
    tags: ["trend", "support/resistance", "cloud"],
    schema: IchimokuParams,
    defaults: IchimokuParams.parse({}),
    doc: "Tenkan/Kijun, Senkou A/B, Chikou with optional shift (plot-friendly).",
  },
  obv: {
    id: "obv",
    name: "OBV",
    short: "On-Balance Volume",
    icon: <Equal className="h-4 w-4" aria-hidden />,
    tags: ["volume", "divergence"],
    schema: OBVParams,
    defaults: OBVParams.parse({}),
    doc: "Cumulative volume flow; optional smoothing & sources.",
  },
  stochrsi: {
    id: "stochrsi",
    name: "Stochastic RSI",
    short: "RSI in stochastic space",
    icon: <Atom className="h-4 w-4" aria-hidden />,
    tags: ["oscillator", "overbought/oversold"],
    schema: StochRSIParams,
    defaults: StochRSIParams.parse({}),
    doc: "Fast/Slow/Full with multiple K/D smoothers; band signals.",
  },
  vwap: {
    id: "vwap",
    name: "VWAP",
    short: "Volume-Weighted Avg Price",
    icon: <LineChart className="h-4 w-4" aria-hidden />,
    tags: ["anchor", "intraday", "bands"],
    schema: VWAPParams,
    defaults: VWAPParams.parse({}),
    doc: "Anchored/session VWAP with optional deviation bands.",
  },
};

// ───────────────────────────────────────────────────────────────────────────────
// 2) State (URL + localStorage persistence)
// ───────────────────────────────────────────────────────────────────────────────

type IndicatorState = {
  enabled: Partial<Record<IndicatorId, boolean>>;
  params: Partial<Record<IndicatorId, Record<string, unknown>>>;
};

const STORAGE_KEY = "nexusa:indicators:v1";

function useIndicatorState() {
  const router = useRouter();
  const sp = useSearchParams();
  const [state, setState] = useState<IndicatorState>({ enabled: {}, params: {} });

  // Load from URL first, then localStorage
  useEffect(() => {
    const urlOn = sp.get("on"); // e.g. adx,atr,ichimoku
    const initial: IndicatorState = { enabled: {}, params: {} };

    if (urlOn) {
      urlOn.split(",").forEach((id) => {
        if (IndicatorId.safeParse(id).success) initial.enabled[id as IndicatorId] = true;
      });
    }

    // merge with storage
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as IndicatorState;
        initial.enabled = { ...parsed.enabled, ...initial.enabled };
        initial.params = parsed.params || {};
      }
    } catch {}

    // fill defaults for any missing params
    (Object.keys(INDICATOR_DEFS) as IndicatorId[]).forEach((id) => {
      if (!initial.params[id]) initial.params[id] = INDICATOR_DEFS[id].defaults;
      if (typeof initial.enabled[id] === "undefined") initial.enabled[id] = id === "vwap"; // sensible default
    });

    setState(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (!state) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }, [state]);

  // Shareable URL (keep list of enabled)
  const updateUrl = (next: IndicatorState) => {
    const enabledIds = (Object.keys(next.enabled) as IndicatorId[]).filter((k) => next.enabled[k]);
    const qs = new URLSearchParams(Array.from(sp.entries()));
    if (enabledIds.length) qs.set("on", enabledIds.join(",")); else qs.delete("on");
    router.replace(`?${qs.toString()}`);
  };

  const setEnabled = (id: IndicatorId, on: boolean) => {
    setState((prev) => {
      const next = { ...prev, enabled: { ...prev.enabled, [id]: on } };
      updateUrl(next);
      return next;
    });
  };

  const setParams = (id: IndicatorId, patch: Record<string, unknown>) => {
    setState((prev) => ({ ...prev, params: { ...prev.params, [id]: { ...prev.params[id], ...patch } } }));
  };

  const resetAll = () => {
    const def: IndicatorState = { enabled: {}, params: {} };
    (Object.keys(INDICATOR_DEFS) as IndicatorId[]).forEach((id) => {
      def.enabled[id] = id === "vwap";
      def.params[id] = INDICATOR_DEFS[id].defaults;
    });
    setState(def);
    updateUrl(def);
  };

  return { state, setEnabled, setParams, resetAll };
}

// ───────────────────────────────────────────────────────────────────────────────
// 3) Save profile (optimistic)
// ───────────────────────────────────────────────────────────────────────────────

async function saveIndicatorsProfile(payload: IndicatorState): Promise<{ ok: boolean }>{
  // Stub – wire to your API (JWT required). Keep it safe for Edge.
  await new Promise((r) => setTimeout(r, 350));
  return { ok: true };
}

// ───────────────────────────────────────────────────────────────────────────────
// 4) Page component
// ───────────────────────────────────────────────────────────────────────────────

export default function IndicatorsPage() {
  const { state, setEnabled, setParams, resetAll } = useIndicatorState();
  const [query, setQuery] = useState("");
  const [onlyEnabled, setOnlyEnabled] = useState(false);
  const [isPending, startTransition] = useTransition();

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (Object.keys(INDICATOR_DEFS) as IndicatorId[])
      .map((id) => ({ id, def: INDICATOR_DEFS[id] }))
      .filter(({ id, def }) => {
        const on = state.enabled[id];
        const matches = !q || def.name.toLowerCase().includes(q) || def.tags.some((t) => t.includes(q));
        return matches && (!onlyEnabled || on);
      });
  }, [query, onlyEnabled, state.enabled]);

  const totalOn = useMemo(() => (Object.keys(state.enabled) as IndicatorId[]).filter((k) => state.enabled[k]).length, [state.enabled]);

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-6xl px-4 md:px-6 py-10 text-white">
        <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Indicators</h1>
            <p className="text-sm text-white/60">Enable indicators and tune their parameters. State persists to URL & device. </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-white/50" />
              <Input
                className="pl-8 w-64 bg-white/5 border-white/10 text-white placeholder:text-white/40"
                placeholder="Search indicators…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Button variant="secondary" className="bg-white/5 border-white/10" onClick={() => setOnlyEnabled((s) => !s)}>
              <Filter className="mr-2 h-4 w-4" /> {onlyEnabled ? "Showing enabled" : "All"}
            </Button>
            <Button variant="secondary" className="bg-white/5 border-white/10" onClick={resetAll}>
              Reset
            </Button>
            <Button
              onClick={() =>
                startTransition(async () => {
                  const res = await saveIndicatorsProfile(state);
                  if (res.ok) toast.success("Saved indicator profile");
                  else toast.error("Save failed");
                })
              }
              disabled={isPending}
            >
              <Save className="mr-2 h-4 w-4" /> {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </header>

        <div className="mb-4 flex items-center gap-3 text-sm">
          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-300 border-emerald-400/20">{totalOn} enabled</Badge>
          <Badge variant="secondary" className="bg-white/5 border-white/10">Shareable URL</Badge>
          <Badge variant="secondary" className="bg-white/5 border-white/10">A11y ready</Badge>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ id, def }) => (
            <IndicatorCard
              key={id}
              id={id}
              def={def}
              enabled={!!state.enabled[id]}
              params={(state.params[id] as Record<string, unknown>) || def.defaults}
              onToggle={(on) => setEnabled(id, on)}
              onParams={(patch) => setParams(id, patch)}
            />
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// 5) Indicator card + settings sheet
// ───────────────────────────────────────────────────────────────────────────────

type Def = typeof INDICATOR_DEFS[IndicatorId];

function IndicatorCard({
  id,
  def,
  enabled,
  params,
  onToggle,
  onParams,
}: {
  id: IndicatorId;
  def: Def;
  enabled: boolean;
  params: Record<string, unknown>;
  onToggle: (on: boolean) => void;
  onParams: (patch: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card className={cn("group relative overflow-hidden border-white/10 bg-white/[0.04] backdrop-blur-sm transition", enabled ? "ring-1 ring-emerald-400/25" : "")}> 
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-b from-sky-400/80 to-indigo-600/80 ring-1 ring-white/15 shadow-[0_10px_25px_-10px_rgba(0,0,0,.6)]">
              {def.icon}
            </div>
            <div>
              <CardTitle className="text-base leading-tight">{def.name}</CardTitle>
              <p className="text-[12px] text-white/60 leading-tight">{def.short}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {enabled && <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-300 border-emerald-400/20">ON</Badge>}
            <Switch aria-label={`Toggle ${def.name}`} checked={enabled} onCheckedChange={onToggle} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <p className="text-xs text-white/65 min-h-10">{def.doc}</p>
        <div className="mt-3 flex items-center gap-1 flex-wrap">
          {def.tags.map((t) => (
            <Badge key={t} variant="secondary" className="bg-white/5 border-white/10 text-[10px]">{t}</Badge>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button size="sm" variant="secondary" className="bg-white/5 border-white/10">
                <SlidersHorizontal className="mr-2 h-4 w-4" /> Settings
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[380px] sm:w-[420px] bg-[#0b1220] text-white border-l border-white/10">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2"><Settings className="h-4 w-4" /> {def.name} settings</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-5">
                {renderSettings(id, def, params, onParams)}
                <Separator className="bg-white/10" />
                <div className="text-xs text-white/60">Validated with zod · Invalid inputs are rejected.</div>
              </div>
            </SheetContent>
          </Sheet>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="secondary" className="bg-white/5 border-white/10">
                <Info className="mr-2 h-4 w-4" /> Docs
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">{def.doc}</TooltipContent>
          </Tooltip>
        </div>
      </CardContent>

      {/* bottom glow */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// 6) Settings renderer per indicator (strongly typed via ids)
// ───────────────────────────────────────────────────────────────────────────────

function LabeledSlider({ label, value, onChange, min, max, step = 1, suffix }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; suffix?: string; }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label className="text-xs text-white/80">{label}</Label>
        <span className="text-xs text-white/60">{value}{suffix ?? ""}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} className="mt-2" />
    </div>
  );
}

function renderSettings(id: IndicatorId, def: Def, params: Record<string, unknown>, onParams: (patch: Record<string, unknown>) => void) {
  const commit = (patch: Record<string, unknown>) => {
    // Validate against schema before committing
    const parsed = def.schema.safeParse({ ...def.defaults, ...params, ...patch });
    if (!parsed.success) {
      toast.error(parsed.error.errors?.[0]?.message ?? "Invalid value");
      return;
    }
    onParams(patch);
    toast.success("Updated");
  };

  switch (id) {
    case "adx": {
      const p = { ...(def.defaults as any), ...(params as any) } as z.infer<typeof ADXParams>;
      return (
        <div className="space-y-4">
          <LabeledSlider label="Period" value={p.period} min={3} max={100} onChange={(v) => commit({ period: v })} />
          <div className="space-y-2">
            <Label className="text-xs text-white/80">Smoothing</Label>
            <Select defaultValue={p.method} onValueChange={(v) => commit({ method: v })}>
              <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="wilder">Wilder (RMA)</SelectItem>
                <SelectItem value="ema">EMA</SelectItem>
                <SelectItem value="sma">SMA</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );
    }
    case "atr": {
      const p = { ...(def.defaults as any), ...(params as any) } as z.infer<typeof ATRParams>;
      return (
        <div className="space-y-4">
          <LabeledSlider label="Period" value={p.period} min={2} max={100} onChange={(v) => commit({ period: v })} />
          <div className="space-y-2">
            <Label className="text-xs text-white/80">Method</Label>
            <Select defaultValue={p.method} onValueChange={(v) => commit({ method: v })}>
              <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="wilder">Wilder (RMA)</SelectItem>
                <SelectItem value="ema">EMA</SelectItem>
                <SelectItem value="sma">SMA</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <LabeledSlider label="Bands k" value={p.bandsK} min={0} max={10} step={0.5} onChange={(v) => commit({ bandsK: v })} />
        </div>
      );
    }
    case "ichimoku": {
      const p = { ...(def.defaults as any), ...(params as any) } as z.infer<typeof IchimokuParams>;
      return (
        <div className="space-y-4">
          <LabeledSlider label="Tenkan" value={p.tenkan} min={2} max={60} onChange={(v) => commit({ tenkan: v })} />
          <LabeledSlider label="Kijun" value={p.kijun} min={2} max={120} onChange={(v) => commit({ kijun: v })} />
          <LabeledSlider label="Senkou B" value={p.senkouB} min={2} max={200} onChange={(v) => commit({ senkouB: v })} />
          <LabeledSlider label="Displacement" value={p.disp} min={0} max={120} onChange={(v) => commit({ disp: v })} />
          <div className="flex items-center justify-between">
            <Label className="text-xs text-white/80">Shifted (plot‑friendly)</Label>
            <Switch checked={p.shifted} onCheckedChange={(v) => commit({ shifted: v })} />
          </div>
        </div>
      );
    }
    case "obv": {
      const p = { ...(def.defaults as any), ...(params as any) } as z.infer<typeof OBVParams>;
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs text-white/80">Smoothing</Label>
            <Select defaultValue={p.smooth} onValueChange={(v) => commit({ smooth: v })}>
              <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="sma">SMA</SelectItem>
                <SelectItem value="ema">EMA</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {p.smooth !== "none" && (
            <LabeledSlider label="Smooth period" value={p.smoothPeriod} min={1} max={200} onChange={(v) => commit({ smoothPeriod: v })} />
          )}
          <div className="space-y-2">
            <Label className="text-xs text-white/80">Price source</Label>
            <Select defaultValue={p.source} onValueChange={(v) => commit({ source: v })}>
              <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="close">Close</SelectItem>
                <SelectItem value="hl2">HL2</SelectItem>
                <SelectItem value="ohlc4">OHLC4</SelectItem>
                <SelectItem value="ha">Heikin‑Ashi</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );
    }
    case "stochrsi": {
      const p = { ...(def.defaults as any), ...(params as any) } as z.infer<typeof StochRSIParams>;
      return (
        <div className="space-y-4">
          <LabeledSlider label="RSI period" value={p.rsiPeriod} min={3} max={200} onChange={(v) => commit({ rsiPeriod: v })} />
          <LabeledSlider label="K period" value={p.kPeriod} min={1} max={200} onChange={(v) => commit({ kPeriod: v })} />
          <LabeledSlider label="D period" value={p.dPeriod} min={1} max={200} onChange={(v) => commit({ dPeriod: v })} />
          <div className="space-y-2">
            <Label className="text-xs text-white/80">Averaging</Label>
            <Select defaultValue={p.avg} onValueChange={(v) => commit({ avg: v })}>
              <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sma">SMA</SelectItem>
                <SelectItem value="ema">EMA</SelectItem>
                <SelectItem value="wma">WMA</SelectItem>
                <SelectItem value="hma">HMA</SelectItem>
                <SelectItem value="kama">KAMA</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-white/80">Scale</Label>
            <Select defaultValue={p.scale} onValueChange={(v) => commit({ scale: v })}>
              <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0_1">0–1</SelectItem>
                <SelectItem value="0_100">0–100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );
    }
    case "vwap": {
      const p = { ...(def.defaults as any), ...(params as any) } as z.infer<typeof VWAPParams>;
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs text-white/80">Anchor</Label>
            <Select defaultValue={p.anchor} onValueChange={(v) => commit({ anchor: v })}>
              <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="session">Session</SelectItem>
                <SelectItem value="day">Day</SelectItem>
                <SelectItem value="week">Week</SelectItem>
                <SelectItem value="month">Month</SelectItem>
                <SelectItem value="ytd">YTD</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-white/80">Bands</Label>
            <Select defaultValue={p.bands} onValueChange={(v) => commit({ bands: v })}>
              <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="stdev">±k·σ (stdev)</SelectItem>
                <SelectItem value="mad">±k·MAD</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {p.bands !== "none" && (
            <LabeledSlider label="k" value={p.k} min={0} max={5} step={0.5} onChange={(v) => commit({ k: v })} />
          )}
        </div>
      );
    }
  }
}
