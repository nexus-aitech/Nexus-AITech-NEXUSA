// ---------- KYC: webhook (production-grade) ----------
// webapp/src/app/api/kyc/webhook/route.ts
export const runtime = "nodejs";

import { NextResponse as R } from "next/server";
import { z } from "zod";
import { Redis } from "@upstash/redis";

// ─────────────────────────────────────────────────────────────
// Redis (برای نگاشت sessionId→userId و جلوگیری از پردازش تکراری)
// ─────────────────────────────────────────────────────────────
const redis = process.env.REDIS_URL
  ? new Redis({ url: process.env.REDIS_URL, token: process.env.REDIS_TOKEN! })
  : null;

// ─────────────────────────────────────────────────────────────
// Input schema — payload نمونه‌ای که اکثر Providerها می‌فرستند
// (مطابق مستندات Provider خودت اصلاح کن)
// ─────────────────────────────────────────────────────────────
const WebhookSchema = z.object({
  id: z.string().min(6),                            // event id (unique)
  type: z.string().min(3),                          // e.g. "kyc.review.completed"
  sessionId: z.string().min(6),                     // provider session id
  userId: z.string().uuid().optional(),             // ممکنه provider نفرسته
  status: z.enum(["approved", "rejected", "pending", "resubmit"]).or(z.string()),
  reason: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  data: z.record(z.any()).optional(),               // جزئیات بیشتر
});

// ─────────────────────────────────────────────────────────────
// امنیت وبهوک: HMAC امضاء شده
//  - headerها را با توجه به provider تنظیم کن (نمونه: x-kyc-signature, x-kyc-timestamp)
//  - الگوریتم: sign = HMAC_SHA256( timestamp + "." + rawBody )
// ─────────────────────────────────────────────────────────────
const SIGNATURE_HEADER = "x-kyc-signature";
const TIMESTAMP_HEADER = "x-kyc-timestamp";
const WEBHOOK_SECRET = process.env.KYC_WEBHOOK_SECRET || "";

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function verifySignature(raw: string, headers: Headers): Promise<{ ok: boolean; err?: string }> {
  if (!WEBHOOK_SECRET) return { ok: false, err: "missing secret" };
  const sig = headers.get(SIGNATURE_HEADER) || "";
  const ts = headers.get(TIMESTAMP_HEADER) || "";
  if (!sig || !ts) return { ok: false, err: "missing headers" };

  // محدودیت زمانی برای جلوگیری از replay attack (۵ دقیقه)
  const skew = Math.abs(Date.now() - Number(ts));
  if (!Number.isFinite(Number(ts)) || skew > 5 * 60_000) {
    return { ok: false, err: "timestamp skew" };
  }

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBytes = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}.${raw}`));
  const calc = [...new Uint8Array(sigBytes)].map(b => b.toString(16).padStart(2, "0")).join("");

  return { ok: timingSafeEqual(calc, sig) };
}

// ─────────────────────────────────────────────────────────────
// توابع DB — این‌ها را به لایهٔ واقعی دیتابیس وصل کن
// ─────────────────────────────────────────────────────────────
async function mapSessionToUser(sessionId: string): Promise<string | null> {
  if (!redis) return null;
  const rec = await redis.get<{ userId: string }>(`kyc:session:${sessionId}`);
  return rec?.userId ?? null;
}

async function setUserKycStatus(userId: string, status: string, reason?: string) {
  // TODO: UPDATE users SET kyc_status=?, kyc_reason=? WHERE id=?
  // مثال: await db.user.update({ where: { id: userId }, data: { kycStatus: status, kycReason: reason ?? null } });
  return { id: userId, kycStatus: status };
}

// ─────────────────────────────────────────────────────────────
// Idempotency: تضمین پردازش یکتا برای هر event.id
// ─────────────────────────────────────────────────────────────
async function ensureIdempotent(eventId: string): Promise<boolean> {
  if (!redis) return true; // در dev بدون Redis، اجازه می‌دهیم
  // set اگر وجود نداشت، TTL بده؛ اگر بود، یعنی تکراری
  // با upstash: set(key, value, { nx: true, ex: 300 })
  const ok = await redis.set(`kyc:event:${eventId}`, "1", { nx: true, ex: 300 });
  return ok === "OK";
}

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    // دریافت raw body برای امضا
    const raw = await req.text();

    // اعتبارسنجی امضاء
    const sig = await verifySignature(raw, req.headers);
    if (!sig.ok) {
      // برای اکثر providerها اگر 4xx بدهی دوباره retry نمی‌کنند؛ اگر می‌خواهی retry شود 5xx بده.
      console.warn("[kyc/webhook] invalid signature", sig.err);
      return R.json({ ok: false }, { status: 401 });
    }

    // Parse و Validate
    const json = JSON.parse(raw);
    const parsed = WebhookSchema.safeParse(json);
    if (!parsed.success) {
      console.warn("[kyc/webhook] invalid payload", parsed.error.issues);
      return R.json({ ok: false }, { status: 400 });
    }
    const { id: eventId, sessionId, userId: userIdMaybe, status, reason } = parsed.data;

    // Idempotency
    const firstTime = await ensureIdempotent(eventId);
    if (!firstTime) {
      // قبلاً پردازش شده؛ 200 بده تا provider دوباره نفرسته
      return R.json({ ok: true, duplicate: true }, { status: 200 });
    }

    // userId را پیدا کن (اگر provider نفرستاده باشد)
    let userId = userIdMaybe || null;
    if (!userId) {
      userId = await mapSessionToUser(sessionId);
      if (!userId) {
        console.error("[kyc/webhook] cannot resolve userId", { sessionId });
        // 200 بده ولی لاگ کن؛ بعضی providerها تکرار می‌کنند
        return R.json({ ok: true, unresolved: true }, { status: 200 });
      }
    }

    // به‌روزرسانی وضعیت KYC کاربر
    await setUserKycStatus(userId, status, reason);

    // موفقیت
    return R.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error("[kyc/webhook] error", { message: err?.message, stack: err?.stack });
    // 5xx باعث retry از سمت provider می‌شود
    return R.json({ ok: false }, { status: 500 });
  }
}
