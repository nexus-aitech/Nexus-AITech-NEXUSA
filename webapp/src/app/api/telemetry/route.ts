import { NextRequest, NextResponse } from "next/server"

// 🔹 می‌تونی به جای console از دیتابیس/ClickHouse یا حتی Sentry استفاده کنی
// فعلاً یه لاگر ساده با متادیتا می‌سازیم
function logTelemetry(event: any) {
  console.log("📡 Telemetry Event:", JSON.stringify(event, null, 2))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const event = {
      ...body,
      ip: req.headers.get("x-forwarded-for") || "unknown",
      ua: req.headers.get("user-agent") || "unknown",
      ts: Date.now(),
    }

    logTelemetry(event)

    return NextResponse.json(
      { ok: true, msg: "Telemetry received", event },
      { status: 200 }
    )
  } catch (err: any) {
    console.error("❌ Telemetry error:", err)
    return NextResponse.json(
      { ok: false, error: err.message || "Invalid request" },
      { status: 400 }
    )
  }
}

export async function GET() {
  return NextResponse.json(
    { ok: true, msg: "Telemetry endpoint is live ✅" },
    { status: 200 }
  )
}
