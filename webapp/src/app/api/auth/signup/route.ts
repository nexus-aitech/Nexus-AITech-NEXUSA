// webapp/src/app/api/auth/signup/route.ts
export const runtime = "nodejs";

import { NextResponse as R } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/security";
import argon2 from "argon2";

// اگر اسکیما از قبل داری، همین را ایمپورت کن و این zod را حذف کن:
// import { signupSchema } from "@/lib/validation/auth";
const signupSchema = z.object({
  email: z.string().email().transform((v) => v.trim().toLowerCase()),
  fullName: z.string().min(2).max(80),
  password: z.string().min(8).max(128),
});

// TODO: به لایهٔ DB واقعی وصل کن
async function findUserByEmail(email: string) { return null as null | { id: string }; }
async function createUser(input: { email: string; fullName: string; passwordHash: string }) {
  return { id: `u_${crypto.randomUUID()}` };
}
async function sendVerificationEmail(email: string, token: string) {
  // اینجا provider واقعی ایمیل را وصل کن (SES/SendGrid/Mailgun…)
  // نمونه: await mail.send({ to: email, subject: "...", html: "..." })
  console.log("[EMAIL][VERIFY] email=%s token=%s", email, token);
}

function getClientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim()
      || req.headers.get("cf-connecting-ip")
      || req.headers.get("x-real-ip")
      || "0.0.0.0";
}

export async function POST(req: Request) {
  try {
    // Rate limit (محافظت در برابر abuse)
    const ip = getClientIp(req);
    const limit = await rateLimit(`signup:${ip}`, { windowMs: 60_000, max: 10 });
    if (!limit.ok) {
      return R.json(
        { message: "تلاش زیاد؛ بعداً دوباره تلاش کنید", retryAfter: limit.retryAfter },
        { status: 429, headers: { "Retry-After": String(Math.ceil((limit.retryAfter ?? 1000) / 1000)) } }
      );
    }

    // Validate payload
    const raw = await req.json().catch(() => ({}));
    const parsed = signupSchema.safeParse(raw);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join("؛ ");
      return R.json({ message }, { status: 400 });
    }
    const { email, fullName, password } = parsed.data;

    // Uniqueness check
    const existing = await findUserByEmail(email);
    if (existing) {
      return R.json({ message: "این ایمیل قبلاً ثبت شده است" }, { status: 409 });
    }

    // Password hashing (argon2id)
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 64 * 1024,
      timeCost: 3,
      parallelism: 2,
      hashLength: 32,
    });

    // Create user (DB)
    const user = await createUser({ email, fullName, passwordHash });

    // Email verification (توکن یکبارمصرف)
    const verifyToken = crypto.randomUUID(); // بهتر: توکن امضاشده/زمان‌دار
    await sendVerificationEmail(email, verifyToken);

    return R.json({ ok: true, userId: user.id });
  } catch (err: any) {
    console.error("[signup] error", { message: err?.message, stack: err?.stack });
    return R.json({ message: "خطای داخلی سرور" }, { status: 500 });
  }
}
