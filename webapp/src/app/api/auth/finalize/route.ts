// ---------- Finalize ----------
// webapp/src/app/api/auth/finalize/route.ts
import { hashPassword } from "@/lib/security";
export async function POST(req: Request) {
const { userId, password } = await req.json().catch(() => ({}));
if (!userId || !password || password.length < 8) return R.json({ error: "Invalid" }, { status: 400 });
const passwordHash = await hashPassword(password);
// TODO: persist passwordHash to DB and mark user active (email/phone verified + kyc approved)
return R.json({ ok: true });
}