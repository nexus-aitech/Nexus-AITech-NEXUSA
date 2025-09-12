// =============================================================
// SECURITY HELPERS — webapp/src/lib/security.ts
// =============================================================
import argon2 from "argon2";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
export const SECURITY = {
  otpTTLms: 5 * 60_000, // 5 minutes
  otpDigits: 6,
  rate: { windowMs: 60_000, max: 5 }, // 5 requests per minute
};

// ─────────────────────────────────────────────────────────────
// OTP Helpers
// ─────────────────────────────────────────────────────────────
/** Generate n-digit numeric OTP */
export function genOTP(digits = SECURITY.otpDigits) {
  const max = 10 ** digits;
  const n = (crypto.getRandomValues(new Uint32Array(1))[0] % max)
    .toString()
    .padStart(digits, "0");
  return n;
}

/** HMAC-SHA256(code + subject) hex */
export async function hashOTP(code: string, subject: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(process.env.OTP_SECRET || "dev-secret-change-me"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const data = enc.encode(`${code}|${subject}`);
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─────────────────────────────────────────────────────────────
// Password Hashing (Argon2id)
// ─────────────────────────────────────────────────────────────
/** Password hashing with Argon2id */
export async function hashPassword(password: string) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 64 * 1024,
    timeCost: 3,
    parallelism: 2,
    hashLength: 32,
  });
}

/** Verify password */
export async function verifyPassword(password: string, hashed: string) {
  return argon2.verify(hashed, password);
}

// ─────────────────────────────────────────────────────────────
// Constant-time compare
// ─────────────────────────────────────────────────────────────
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

// ─────────────────────────────────────────────────────────────
// Rate Limiter (Hybrid: In-memory + Redis-ready)
// ─────────────────────────────────────────────────────────────
type RateResult = {
  ok: boolean;
  remaining: number;
  retryAfter?: number; // ms
};

// In-memory bucket
const memoryBuckets = new Map<string, { tokens: number; resetAt: number }>();

/**
 * Advanced rate limiter — hybrid design
 * - In-memory fallback for single-instance
 * - Can plug Redis/Upstash for distributed
 */
export async function rateLimit(
  key: string,
  opts: { windowMs?: number; max?: number } = {}
): Promise<RateResult> {
  const windowMs = opts.windowMs ?? SECURITY.rate.windowMs;
  const max = opts.max ?? SECURITY.rate.max;

  // If Redis is configured, prefer Redis
  if (process.env.REDIS_URL) {
    try {
      const { Redis } = await import("@upstash/redis");
      const redis = new Redis({ url: process.env.REDIS_URL, token: process.env.REDIS_TOKEN! });

      const now = Date.now();
      const windowKey = `ratelimit:${key}:${Math.floor(now / windowMs)}`;

      // increment atomically
      const tx = redis.multi();
      tx.incr(windowKey);
      tx.pexpire(windowKey, windowMs);
      const [count] = (await tx.exec()) as [number];

      if (count > max) {
        return { ok: false, remaining: 0, retryAfter: windowMs - (now % windowMs) };
      }
      return { ok: true, remaining: max - count };
    } catch (err) {
      console.error("Redis rateLimit error, falling back:", err);
      // fallback to memory
    }
  }

  // In-memory bucket (fallback)
  const now = Date.now();
  const bucket = memoryBuckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    memoryBuckets.set(key, { tokens: max - 1, resetAt: now + windowMs });
    return { ok: true, remaining: max - 1 };
  }

  if (bucket.tokens <= 0) {
    return { ok: false, remaining: 0, retryAfter: bucket.resetAt - now };
  }

  bucket.tokens -= 1;
  return { ok: true, remaining: bucket.tokens, retryAfter: bucket.resetAt - now };
}
