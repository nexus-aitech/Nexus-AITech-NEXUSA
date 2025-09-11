// webapp/src/app/api/kyc/webhook/route.ts
export async function POST(req: Request) {
// TODO: verify signature header from provider & update DB user.kycStatus
return R.json({ ok: true });
}