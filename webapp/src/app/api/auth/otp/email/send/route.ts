// ---------- OTP routes (email send) ----------
// webapp/src/app/api/auth/otp/email/send/route.ts
import { NextResponse as R } from "next/server";
import { genOTP, hashOTP, rateLimit, SECURITY } from "@/lib/security";
import { Redis } from "@upstash/redis";

// Redis client (Upstash یا Redis managed service)
const redis = process.env.REDIS_URL
  ? new Redis({ url: process.env.REDIS_URL, token: process.env.REDIS_TOKEN! })
  : null;

/**
 * POST /api/auth/otp/email/send
 * Body: { email: string }
 */
export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "ip";
    const limit = await rateLimit(`otp:email:${ip}`, { windowMs: 60_000, max: 5 });

    if (!limit.ok) {
      return R.json(
        { error: "Too Many Requests", retryAfter: limit.retryAfter },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((limit.retryAfter ?? 1000) / 1000)) },
        }
      );
    }

    const { email } = await req.json().catch(() => ({}));
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return R.json({ error: "Invalid email" }, { status: 400 });
    }

    const code = genOTP();
    const hash = await hashOTP(code, email);

    // ذخیره در Redis (امن و پایدار بین چند سرور)
    if (redis) {
      await redis.setex(`otp:email:${email}`, SECURITY.otpTTLms / 1000, hash);
    } else {
      // fallback: در حافظه محلی (برای dev فقط)
      globalThis.__otpMem ||= new Map<string, { hash: string; exp: number }>();
      globalThis.__otpMem.set(`email:${email}`, { hash, exp: Date.now() + SECURITY.otpTTLms });
    }

    // TODO: ارسال ایمیل واقعی (SendGrid, SES, Mailgun…)
    // اینجا فقط برای تست:
    console.log(`[OTP][EMAIL] code=${code} email=${email}`);

    return R.json({ ok: true });
  } catch (err: any) {
    console.error("OTP email send error", err);
    return R.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
