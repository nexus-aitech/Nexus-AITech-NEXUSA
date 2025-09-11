// webapp/src/app/api/auth/otp/email/verify/route.ts
export async function POST(req: Request) {
const { email, code } = await req.json().catch(() => ({}));
const rec = mem.get(`email:${email}`);
if (!rec || rec.exp < Date.now()) return R.json({ error: "Expired" }, { status: 400 });
const hash = await hashOTP(code, email);
if (hash !== rec.hash) return R.json({ error: "Invalid" }, { status: 400 });
mem.delete(`email:${email}`);
return R.json({ ok: true });
}