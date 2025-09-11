// ---------- OTP routes (email/phone send + verify) ----------
// webapp/src/app/api/auth/otp/email/send/route.ts
import { NextResponse as R } from "next/server";
import { genOTP, hashOTP, rateLimit, SECURITY } from "@/lib/security";


const mem = new Map<string, { hash: string; exp: number }>();


export async function POST(req: Request) {
if (!rateLimit(`email:${req.headers.get("x-forwarded-for") || "ip"}`)) return R.json({ error: "429" }, { status: 429 });
const { email } = await req.json().catch(() => ({}));
if (!email) return R.json({ error: "Invalid" }, { status: 400 });
const code = genOTP();
const hash = await hashOTP(code, email);
mem.set(`email:${email}`, { hash, exp: Date.now() + SECURITY.otpTTLms });
// TODO: send code via email provider
console.log("EMAIL OTP", email, code);
return R.json({ ok: true });
}