// ---------- /api/auth/register/init ----------
// webapp/src/app/api/auth/register/init/route.ts
export const runtime = "nodejs";

import { NextResponse as R } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/security";

// اختیاری: اگر lib/phone داری، این ایمپورت رو فعال کن و نرمالایزر داخلی رو حذف کن
// import { toE164 } from "@/lib/phone";

// --- Phone normalizer (E.164) با fallback به libphonenumber-js در صورت نصب ---
let parsePhone: ((num: string, cc?: string) => string | null) | null = null;
try {
  // @ts-ignore optional dep
  const lp = require("libphonenumber-js");
  parsePhone = (num: string, cc?: string) => {
    const p = cc ? lp.parsePhoneNumber(num, cc.toUpperCase()) : lp.parsePhoneNumber(num);
    return p?.isValid() ? p.number : null; // E.164
  };
} catch { /* optional */ }

function toE164(countryCode: string, phone: string): string | null {
  if (parsePhone) {
    const ccAlpha = /^[A-Za-z]{2}$/.test(countryCode) ? countryCode : undefined;
    const ccDial  = /^[0-9]{1,3}$/.test(countryCode) ? countryCode : undefined;
    if (ccAlpha) return parsePhone(phone, ccAlpha);
    if (ccDial)  return parsePhone(`+${ccDial}${phone}`);
  }
  const cc = String(countryCode).replace(/\D/g, "");
  const digits = String(phone).replace(/\D/g, "");
  if (!cc || !digits) return null;
  const e164 = `+${cc}${digits}`;
  const len = cc.length + digits.length;
  if (len < 8 || len > 15) return null;
  return e164;
}

// --- Validation schema ---
const initSchema = z.object({
  email: z.string().email().transform((v) => v.trim().toLowerCase()),
  countryCode: z.string().min(1),
  phone: z.string().min(4),
});

export async function POST(req: Request) {
  try {
    // Rate limit بر اساس IP
    const ip = req.headers.get("x-forwarded-for") || "ip";
    const limit = await rateLimit(`register:init:${ip}`, { windowMs: 60_000, max: 5 });
    if (!limit.ok) {
      return R.json(
        { error: "Too Many Requests", retryAfter: limit.retryAfter },
        { status: 429, headers: { "Retry-After": String(Math.ceil((limit.retryAfter ?? 1000) / 1000)) } }
      );
    }

    // Parse & validate
    const raw = await req.json().catch(() => ({}));
    const parsed = initSchema.safeParse(raw);
    if (!parsed.success) {
      return R.json({ error: "Invalid payload" }, { status: 400 });
    }
    const { email, countryCode, phone } = parsed.data;

    // Phone normalize
    const phoneE164 = toE164(countryCode, phone);
    if (!phoneE164) {
      return R.json({ error: "Invalid phone format" }, { status: 400 });
    }

    // TODO: چک یکتایی email/phone در DB و ساخت رکورد pending-user
    // نمونه‌ی placeholder (UUID سمت سرور)
    const userId = crypto.randomUUID();

    // Trigger: ارسال OTP ایمیل (مسیر داخلی)
    // توجه: هدر Content-Type باید ست شود
    const base = new URL(req.url);
    const otpUrl = new URL("/api/auth/otp/email/send", base);
    const otpRes = await fetch(otpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-call": "register-init" },
      body: JSON.stringify({ email }),
      // توجه: اگر edge/useFetchCache داری، بسته به نیاز تنظیم کن
      cache: "no-store",
    });

    if (!otpRes.ok) {
      // لاگ ساختارمند برای مانیتورینگ
      console.error("[register:init] OTP email failed", {
        status: otpRes.status,
        statusText: otpRes.statusText,
      });
      return R.json({ error: "OTP dispatch failed" }, { status: 502 });
    }

    // پاسخ موفق
    return R.json({ ok: true, userId, contact: { email, phone: phoneE164 } });
  } catch (err: any) {
    console.error("[register:init] error", { message: err?.message, stack: err?.stack });
    return R.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
