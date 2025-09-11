// Similar for phone send/verify:
// webapp/src/app/api/auth/otp/phone/send/route.ts
export async function POST(req: Request) {
if (!rateLimit(`phone:${req.headers.get("x-forwarded-for") || "ip"}`)) return R.json({ error: "429" }, { status: 429 });
const { countryCode, phone } = await req.json().catch(() => ({}));
if (!countryCode || !phone) return R.json({ error: "Invalid" }, { status: 400 });
const e164 = toE164(countryCode, phone);
const code = genOTP();
const hash = await hashOTP(code, e164);
mem.set(`phone:${e164}`, { hash, exp: Date.now() + SECURITY.otpTTLms });
// TODO: send via SMS provider
console.log("SMS OTP", e164, code);
return R.json({ ok: true });
}