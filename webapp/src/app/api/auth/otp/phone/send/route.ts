// ---------- OTP routes (phone send) ----------
// webapp/src/app/api/auth/otp/phone/send/route.ts
import { NextResponse as R } from "next/server";
import { genOTP, hashOTP, rateLimit, SECURITY } from "@/lib/security";
import { Redis } from "@upstash/redis";

const redis = process.env.REDIS_URL
  ? new Redis({ url: process.env.REDIS_URL, token: process.env.REDIS_TOKEN! })
  : null;

// Optional: use libphonenumber-js if you have it installed for rock-solid parsing
let parsePhone: ((num: string, cc?: string) => string | null) | null = null;
try {
  // @ts-ignore — optional dependency
  const lp = require("libphonenumber-js");
  parsePhone = (num: string, cc?: string) => {
    const p = cc
      ? lp.parsePhoneNumber(num, cc.toUpperCase())
      : lp.parsePhoneNumber(num);
    return p?.isValid() ? p.number : null; // E.164
  };
} catch { /* fallback will be used */ }

function normalizeToE164(countryCode: string, phone: string): string | null {
  // Prefer libphonenumber if available
  if (parsePhone) {
    // countryCode can be "IR" or "98". Try both heuristics.
    const ccAlpha = /^[A-Za-z]{2}$/.test(countryCode) ? countryCode : undefined;
    const ccDial = /^[0-9]{1,3}$/.test(countryCode) ? countryCode : undefined;
    if (ccAlpha) return parsePhone(phone, ccAlpha);
    if (ccDial) return parsePhone(`+${ccDial}${phone}`);
  }

  // Fallback: strict basic normalization (production-safe but less smart)
  const cc = countryCode.replace(/\D/g, "");
  const digits = phone.replace(/\D/g, "");
  if (!cc || !digits) return null;
  const e164 = `+${cc}${digits}`;
  // E.164 max 15 digits (without '+'), min ~8 for sanity
  const len = cc.length + digits.length;
  if (len < 8 || len > 15) return null;
  return e164;
}

/**
 * POST /api/auth/otp/phone/send
 * Body: { countryCode: string; phone: string }
 */
export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "ip";
    const limit = await rateLimit(`otp:phone:${ip}`, { windowMs: 60_000, max: 5 });
    if (!limit.ok) {
      return R.json(
        { error: "Too Many Requests", retryAfter: limit.retryAfter },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((limit.retryAfter ?? 1000) / 1000)) },
        }
      );
    }

    const { countryCode, phone } = await req.json().catch(() => ({}));
    if (!countryCode || !phone) {
      return R.json({ error: "Invalid request" }, { status: 400 });
    }

    const e164 = normalizeToE164(String(countryCode), String(phone));
    if (!e164) {
      return R.json({ error: "Invalid phone format" }, { status: 400 });
    }

    const code = genOTP();
    const hash = await hashOTP(code, e164);

    if (redis) {
      await redis.setex(`otp:phone:${e164}`, SECURITY.otpTTLms / 1000, hash);
    } else {
      // Dev fallback (single-instance)
      // @ts-ignore
      globalThis.__otpMem ||= new Map<string, { hash: string; exp: number }>();
      // @ts-ignore
      globalThis.__otpMem.set(`phone:${e164}`, { hash, exp: Date.now() + SECURITY.otpTTLms });
    }

    // TODO: Integrate real SMS provider (Twilio, Vonage, AWS SNS, etc.)
    // Example interface:
    // await smsProvider.send({ to: e164, text: `Your code: ${code}` });
    console.log(`[OTP][SMS] to=${e164} code=${code}`);

    return R.json({ ok: true });
  } catch (err: any) {
    console.error("OTP phone send error", err);
    return R.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
