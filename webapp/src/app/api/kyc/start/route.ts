// ---------- KYC start/webhook (scaffold) ----------
// webapp/src/app/api/kyc/start/route.ts
export async function POST(req: Request) {
const { userId } = await req.json().catch(() => ({}));
if (!userId) return R.json({ error: "Invalid" }, { status: 400 });
// TODO: call provider (Persona/Onfido/Jumio) to create a session
const url = "https://example-kyc-provider/start-session?id=demo"; // placeholder
return R.json({ ok: true, url });
}