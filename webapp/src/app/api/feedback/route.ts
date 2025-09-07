import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  // TODO: ذخیره در DB یا ارسال به وب‌هوک
  return NextResponse.json({ ok: true, received: body });
}
