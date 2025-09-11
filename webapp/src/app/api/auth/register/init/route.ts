// =============================================================
// API ROUTES (scaffold) — Next.js App Router
// Place under webapp/src/app/api/... (Node runtime)
// =============================================================


// ---------- /api/auth/register/init ----------
// webapp/src/app/api/auth/register/init/route.ts
export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/security";
import { toE164 } from "@/lib/phone";


const initSchema = z.object({ email: z.string().email(), countryCode: z.string(), phone: z.string() });


export async function POST(req: Request) {
if (!rateLimit(`init:${req.headers.get("x-forwarded-for") || "ip"}`))
return NextResponse.json({ error: "Too many requests" }, { status: 429 });


const body = await req.json().catch(() => ({}));
const parsed = initSchema.safeParse(body);
if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });


const email = parsed.data.email.toLowerCase();
const phoneE164 = toE164(parsed.data.countryCode, parsed.data.phone);


// TODO: check DB uniqueness for email/phone and create pending user
const userId = crypto.randomUUID();


// send email OTP (fake)
await fetch(new URL("/api/auth/otp/email/send", req.url), { method: "POST", body: JSON.stringify({ email }) });
return NextResponse.json({ ok: true, userId });
}