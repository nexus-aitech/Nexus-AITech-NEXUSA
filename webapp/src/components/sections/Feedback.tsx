// webapp/src/components/sections/Feedback.tsx
// یک کامپوننت بازخورد در سطح حرفه‌ای و جهانی — بدون وابستگی خارجی
// قابلیت‌ها: اعتبارسنجی سمت کلاینت، محدودیت ارسال، Honeypot ضداسپم،
// جمع‌آوری کانتکست (UA/URL/Viewport/Timezone/Language/Referrer)، شناسه مرجع،
// UI دسترس‌پذیر RTL، و API قابل پیکربندی.

"use client";

import * as React from "react";

// ===== Types =====
export type FeedbackCategory = "bug" | "idea" | "other";
export type FeedbackSeverity = "low" | "medium" | "high";

export interface FeedbackProps {
  endpoint?: string; // پیش‌فرض: "/feedback"
  className?: string;
  compact?: boolean; // true => فشرده‌تر
  initialCategory?: FeedbackCategory;
  initialSeverity?: FeedbackSeverity;
  context?: Record<string, any>; // کانتکست دلخواه توسعه‌دهنده
  onSubmitted?: (result: { ok: boolean; id?: string; error?: string }) => void;
}

// ===== Helpers =====
function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function validEmail(v: string) {
  return !v || /.+@.+\..+/.test(v);
}

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as any).randomUUID();
  // Fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function nowISO() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function gatherContext(extra?: Record<string, any>) {
  if (typeof window === "undefined") return extra || {};
  const d: Record<string, any> = {
    url: window.location?.href,
    path: window.location?.pathname,
    referrer: document.referrer || undefined,
    ua: navigator.userAgent,
    lang: navigator.language,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    ts: nowISO(),
  };
  return { ...d, ...extra };
}

// محدودیت ارسال 60 ثانیه‌ای
const RATE_KEY = "feedback:lastSubmitAt";
function canSubmitAgain() {
  if (typeof window === "undefined") return true;
  const last = Number(localStorage.getItem(RATE_KEY) || 0);
  return Date.now() - last > 60_000; // 60s
}
function markSubmitted() {
  if (typeof window === "undefined") return;
  localStorage.setItem(RATE_KEY, String(Date.now()));
}

// ===== Component =====
export default function Feedback({
  endpoint = "/feedback",
  className,
  compact = false,
  initialCategory = "idea",
  initialSeverity = "medium",
  context,
  onSubmitted,
}: FeedbackProps) {
  // Form state
  const [email, setEmail] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [category, setCategory] = React.useState<FeedbackCategory>(initialCategory);
  const [severity, setSeverity] = React.useState<FeedbackSeverity>(initialSeverity);
  const [allowContact, setAllowContact] = React.useState(true);
  const [includeContext, setIncludeContext] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [doneId, setDoneId] = React.useState<string | null>(null);
  const [chars, setChars] = React.useState(0);

  // Honeypot (anti-bot)
  const [company, setCompany] = React.useState("");

  const minLen = 8;
  const maxLen = 2000;
  const valid = message.trim().length >= minLen && message.length <= maxLen && validEmail(email);
  const rateOk = canSubmitAgain();

  React.useEffect(() => {
    setChars(message.length);
  }, [message]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!valid) {
      setError("اطلاعات فرم صحیح نیست.");
      return;
    }
    if (!rateOk) {
      setError("لطفاً کمی صبر کنید و دوباره تلاش کنید.");
      return;
    }
    if (company) {
      // honeypot triggered — silently ignore as success
      setDoneId(uuid());
      onSubmitted?.({ ok: true, id: doneId || undefined });
      return;
    }

    setLoading(true);
    try {
      const referenceId = uuid();
      const payload = {
        id: referenceId,
        email: email || undefined,
        message: message.trim(),
        category,
        severity,
        allowContact,
        context: includeContext ? gatherContext(context) : undefined,
      };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      });

      if (!res.ok) {
        const data = await safeJson(res);
        throw new Error(data?.error || `خطای سرور (${res.status})`);
      }

      setDoneId(referenceId);
      markSubmitted();
      setEmail("");
      setMessage("");
      setCategory(initialCategory);
      setSeverity(initialSeverity);
      setAllowContact(true);
      setIncludeContext(true);
      onSubmitted?.({ ok: true, id: referenceId });
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "ارسال با خطا مواجه شد.");
      onSubmitted?.({ ok: false, error: err?.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section dir="rtl" className={cn(
      "rounded-2xl border border-white/10 bg-white/[0.04] p-5",
      "backdrop-blur",
      className
    )}>
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-white text-lg font-semibold">بازخورد شما</h2>
          <p className="text-white/60 text-xs mt-1">ایده، باگ یا پیشنهادت را بنویس؛ کمک می‌کند سریع‌تر بهتر شویم.</p>
        </div>
        {doneId ? (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">ثبت شد</span>
        ) : (
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/70">زمان پاسخ ~24–48h</span>
        )}
      </header>

      {/* Success Panel */}
      {doneId && (
        <div className="mb-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-xs text-emerald-200">
          ممنون! فیدبک شما با شناسهٔ <span className="font-mono">{doneId}</span> ثبت شد.
        </div>
      )}

      {/* Error Panel */}
      {error && (
        <div className="mb-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs text-rose-200">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        {/* Email */}
        <div className="grid gap-1">
          <label htmlFor="fb-email" className="text-xs text-white/70">ایمیل (اختیاری)</label>
          <input
            id="fb-email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={cn(
              "rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white",
              "placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            )}
            aria-invalid={!validEmail(email)}
          />
        </div>

        {/* Category & Severity */}
        <div className={cn("grid gap-3", compact ? "grid-cols-2" : "md:grid-cols-3") }>
          <div className="grid gap-1">
            <label className="text-xs text-white/70">دسته‌بندی</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none"
            >
              <option value="idea" className="bg-black">ایده / درخواست قابلیت</option>
              <option value="bug" className="bg-black">گزارش باگ</option>
              <option value="other" className="bg-black">سایر</option>
            </select>
          </div>

          <div className="grid gap-1">
            <label className="text-xs text-white/70">اهمیت</label>
            <div className="flex overflow-hidden rounded-xl border border-white/10">
              {(["low", "medium", "high"] as FeedbackSeverity[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeverity(s)}
                  className={cn(
                    "px-3 py-1.5 text-xs transition",
                    severity === s ? "bg-white/20 text-white" : "bg-white/5 text-white/80 hover:bg-white/10"
                  )}
                >
                  {s === "low" ? "کم" : s === "medium" ? "متوسط" : "زیاد"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-1">
            <label className="text-xs text-white/70">اجازهٔ تماس</label>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80">
              <input id="fb-contact" type="checkbox" checked={allowContact} onChange={(e) => setAllowContact(e.target.checked)} />
              <label htmlFor="fb-contact" className="cursor-pointer">درصورت نیاز با من تماس بگیرید</label>
            </div>
          </div>
        </div>

        {/* Message */}
        <div className="grid gap-1">
          <label htmlFor="fb-msg" className="text-xs text-white/70">پیام شما</label>
          <textarea
            id="fb-msg"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            minLength={minLen}
            maxLength={maxLen}
            rows={compact ? 4 : 6}
            placeholder="چی رو دوست نداشتی؟ چه ایده‌ای داری؟ چه مشکلی دیدی؟"
            className={cn(
              "rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white",
              "placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            )}
            required
          />
          <div className="flex items-center justify-between text-[11px] text-white/50">
            <span>حداقل {minLen} کاراکتر</span>
            <span className="tabular-nums">{chars} / {maxLen}</span>
          </div>
        </div>

        {/* Context & Honeypot */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="inline-flex items-center gap-2 text-xs text-white/70">
            <input type="checkbox" checked={includeContext} onChange={(e) => setIncludeContext(e.target.checked)} />
            ضمیمه‌کردن اطلاعات فنی (URL/UA/…)
          </label>
          {/* Honeypot: فیلد مخفی که کاربر واقعی نباید پر کند */}
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="hidden"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={!valid || loading || !rateOk}
            className={cn(
              "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition",
              "border border-white/10",
              loading || !rateOk ? "bg-white/10 text-white/50" : "bg-emerald-600 hover:bg-emerald-500 text-white"
            )}
          >
            {loading ? "در حال ارسال…" : "ارسال بازخورد"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEmail("");
              setMessage("");
              setCategory(initialCategory);
              setSeverity(initialSeverity);
              setAllowContact(true);
              setIncludeContext(true);
              setError(null);
              setDoneId(null);
            }}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
          >
            پاک‌کردن فرم
          </button>
        </div>
      </form>
    </section>
  );
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
