// webapp/src/app/api/health/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "ok", time: new Date().toISOString() }, { status: 200 });
}
