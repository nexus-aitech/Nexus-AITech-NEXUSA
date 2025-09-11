// webapp/src/app/api/auth/otp/phone/verify/route.ts
export async function POST(req: Request) {
const { countryCode, phone, code } = await req.json().catch(() => ({}));
const e164 = toE164(countryCode, phone);
const rec = mem.get(`phone:${e164}`);
if (!rec || rec.exp < Date.now()) return R.json({ error: "Expired" }, { status: 400 });
const hash = await hashOTP(code, e164);
if (hash !== rec.hash) return R.json({ error: "Invalid" }, { status: 400 });
mem.delete(`phone:${e164}`);
return R.json({ ok: true });
}