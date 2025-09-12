// ---------- OTP routes (phone verify) ----------
// webapp/src/app/api/auth/otp/phone/verify/route.ts
import { NextResponse as R } from "next/server";
import { hashOTP, rateLimit, SECURITY, safeEqual } from "@/lib/security";
import { Redis } from "@upstash/redis";

const redis = process.env.REDIS_URL
  ? new Redis({ url: process.env.REDIS_URL, token: process.env.REDIS_TOKEN! })
  : null;

// Optional libphonenumber-js parsing (production-friendly if installed)
let parsePhone: ((num: string, cc?: string) => string | null) | null = null;
try {
  // @ts-ignore optional dep
  const lp = require("libphonenumber-js");
  parsePhone = (num: string, cc?: string) => {
    const p = cc ? lp.parsePhoneNumber(num, cc.toUpperCase()) : lp.parsePhoneNumber(num);
    return p?.isValid() ? p.number : null; // E.164
  };
} catch {}

// Strict fallback normalizer to E.164 if lib not present
function normalizeToE164(countryCode: string, phone: string): string | null {
  if (parsePhone) {
    const ccAlpha = /^[A-Za-z]{2}$/.test(countryCode) ? countryCode : undefined;
    const ccDial = /^[0-9]{1,3}$/.test(countryCode) ? countryCode : undefined;
    if (ccAlpha) return parsePhone(phone, ccAlpha);
    if (ccDial) return parsePhone(`+${ccDial}${phone}`);
  }
  const cc = countryCode.replace(/\D/g, "");
  const digits = phone.replace(/\D/g, "");
  if (!cc || !digits) return null;
  const e164 = `+${cc}${digits}`;
  const len = cc.length + digits.length;
  if (len < 8 || len > 15) return null;
  return e164;
}

/**
 * POST /api/auth/otp/phone/verify
 * Body: { countryCode: string; phone: string; code: string }
 */
export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "ip";
    const limit = await rateLimit(`otp:verify:phone:${ip}`, { windowMs: 60_000, max: 10 });
    if (!limit.ok) {
      return R.json(
        { error: "Too Many Requests", retryAfter: limit.retryAfter },
        { status: 429, headers: { "Retry-After": String(Math.ceil((limit.retryAfter ?? 1000) / 1000)) } }
      );
    }

    const { countryCode, phone, code } = await req.json().catch(() => ({}));
    if (!countryCode || !phone || !code || typeof code !== "string") {
      return R.json({ error: "Invalid request" }, { status: 400 });
    }

    const e164 = normalizeToE164(String(countryCode), String(phone));
    if (!e164) return R.json({ error: "Invalid phone format" }, { status: 400 });

    // Fetch stored OTP hash
    let storedHash: string | null = null;
    if (redis) {
      storedHash = (await redis.get<string>(`otp:phone:${e164}`)) ?? null;
    } else {
      // @ts-ignore dev-only fallback bucket
      globalThis.__otpMem ||= new Map<string, { hash: string; exp: number }>();
      // @ts-ignore
      const rec = globalThis.__otpMem.get(`phone:${e164}`);
      if (rec && rec.exp > Date.now()) storedHash = rec.hash;
    }

    if (!storedHash) return R.json({ error: "Expired or not found" }, { status: 400 });

    // Verify (constant-time)
    const candidate = await hashOTP(code, e164);
    if (!safeEqual(candidate, storedHash)) {
      return R.json({ error: "Invalid code" }, { status: 400 });
    }

    // Consume OTP (one-time use)
    if (redis) {
      await redis.del(`otp:phone:${e164}`);
    } else {
      // @ts-ignore
      globalThis.__otpMem.delete(`phone:${e164}`);
    }

    console.log(`[OTP][SMS][VERIFY] success phone=${e164}`);
    return R.json({ ok: true });
  } catch (err: any) {
    console.error("OTP phone verify error", err);
    return R.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
