// ---------- KYC: start session (production-grade) ----------
// webapp/src/app/api/kyc/start/route.ts
export const runtime = "nodejs";

import { NextResponse as R } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/security";
import { Redis } from "@upstash/redis";

// Optional Redis (idempotency + session cache across instances)
const redis = process.env.REDIS_URL
  ? new Redis({ url: process.env.REDIS_URL, token: process.env.REDIS_TOKEN! })
  : null;

// Input schema
const bodySchema = z.object({
  userId: z.string().uuid(),
  // Optional idempotency key (to avoid duplicate sessions on retries)
  idemKey: z.string().min(8).max(128).optional(),
});

// Provider interface (Persona/Onfido/Jumio …)
interface KycProvider {
  createSession(input: {
    userId: string;
    webhookUrl: string;
    // add fields like locale, documentTypes, etc.
  }): Promise<{ sessionId: string; url: string; expiresAt?: string }>;
}

// Example provider stub (replace with real SDK/API)
const provider: KycProvider = {
  async createSession({ userId, webhookUrl }) {
    // TODO: integrate real provider (use their SDK or REST API)
    // Include server-side secret auth here; NEVER expose on client
    const sessionId = `kyc_${crypto.randomUUID()}`;
    const url = `https://example-kyc-provider/start-session?sid=${encodeURIComponent(sessionId)}&u=${encodeURIComponent(
      userId
    )}`;
    // Normally you would POST to provider and get sessionId+url back, with webhookUrl registered.
    return { sessionId, url, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
  },
};

function getClientIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "0.0.0.0"
  );
}

export async function POST(req: Request) {
  try {
    // Rate limit (protect from abuse)
    const ip = getClientIp(req);
    const limit = await rateLimit(`kyc:start:${ip}`, { windowMs: 60_000, max: 10 });
    if (!limit.ok) {
      return R.json(
        { error: "Too Many Requests", retryAfter: limit.retryAfter },
        { status: 429, headers: { "Retry-After": String(Math.ceil((limit.retryAfter ?? 1000) / 1000)) } }
      );
    }

    // Parse & validate
    const raw = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join("؛ ");
      return R.json({ error: message }, { status: 400 });
    }
    const { userId, idemKey } = parsed.data;

    // Idempotency (avoid duplicate KYC sessions for same request)
    if (redis && idemKey) {
      const cacheKey = `kyc:start:${userId}:${idemKey}`;
      const existing = await redis.get<{ sessionId: string; url: string; expiresAt?: string }>(cacheKey);
      if (existing) {
        return R.json({ ok: true, ...existing, idempotent: true }, { status: 200 });
      }
    }

    // Build webhook URL (provider will POST results here)
    const base = new URL(req.url);
    const webhookUrl = new URL("/api/kyc/webhook", base).toString();

    // Create provider session
    const session = await provider.createSession({ userId, webhookUrl });

    // Persist session mapping (for later reconciliation in webhook/finalize)
    if (redis) {
      // Store mapping sessionId -> userId (and optional idemKey dedupe)
      await Promise.all([
        redis.setex(`kyc:session:${session.sessionId}`, 60 * 60, JSON.stringify({ userId })), // 1h
        idemKey ? redis.setex(`kyc:start:${userId}:${idemKey}`, 30 * 60, session) : Promise.resolve(),
      ]);
    }

    // Security headers
    const headers = new Headers({
      "Cache-Control": "no-store, max-age=0",
      "Content-Security-Policy": "default-src 'none'",
    });

    return new R(
      JSON.stringify({ ok: true, sessionId: session.sessionId, url: session.url, expiresAt: session.expiresAt }),
      { status: 201, headers }
    );
  } catch (err: any) {
    console.error("[kyc/start] error", { message: err?.message, stack: err?.stack });
    return R.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
