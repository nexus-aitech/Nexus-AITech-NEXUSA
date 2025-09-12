// ---------- OTP routes (email verify) ----------
// webapp/src/app/api/auth/otp/email/verify/route.ts
import { NextResponse as R } from "next/server";
import { hashOTP, rateLimit, SECURITY, safeEqual } from "@/lib/security";
import { Redis } from "@upstash/redis";

// Redis client (Upstash یا managed Redis)
const redis = process.env.REDIS_URL
  ? new Redis({ url: process.env.REDIS_URL, token: process.env.REDIS_TOKEN! })
  : null;

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "ip";
    const limit = await rateLimit(`otp:verify:${ip}`, { windowMs: 60_000, max: 10 });

    if (!limit.ok) {
      return R.json(
        { error: "Too Many Requests", retryAfter: limit.retryAfter },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((limit.retryAfter ?? 1000) / 1000)) },
        }
      );
    }

    const { email, code } = await req.json().catch(() => ({}));
    if (!email || typeof email !== "string" || !code || typeof code !== "string") {
      return R.json({ error: "Invalid request" }, { status: 400 });
    }

    // --- Fetch stored hash ---
    let storedHash: string | null = null;

    if (redis) {
      storedHash = (await redis.get<string>(`otp:email:${email}`)) ?? null;
    } else {
      globalThis.__otpMem ||= new Map<string, { hash: string; exp: number }>();
      const rec = globalThis.__otpMem.get(`email:${email}`);
      if (rec && rec.exp > Date.now()) {
        storedHash = rec.hash;
      }
    }

    if (!storedHash) {
      return R.json({ error: "Expired or not found" }, { status: 400 });
    }

    // --- Validate ---
    const candidateHash = await hashOTP(code, email);
    if (!safeEqual(candidateHash, storedHash)) {
      return R.json({ error: "Invalid code" }, { status: 400 });
    }

    // --- Consume OTP (one-time use) ---
    if (redis) {
      await redis.del(`otp:email:${email}`);
    } else {
      globalThis.__otpMem.delete(`email:${email}`);
    }

    console.log(`[OTP][VERIFY] success email=${email}`);

    return R.json({ ok: true });
  } catch (err: any) {
    console.error("OTP email verify error", err);
    return R.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
