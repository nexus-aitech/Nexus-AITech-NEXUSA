// webapp/src/app/api/health/route.ts
export const runtime = "nodejs";

import { NextResponse as R } from "next/server";

export async function GET() {
  try {
    // نمونه: بررسی وضعیت دیتابیس/کش
    // const dbOk = await db.ping();
    // const redisOk = await redis.ping();

    return R.json(
      {
        status: "ok",
        uptime: process.uptime(), // مدت زمان اجرای پروسه
        time: new Date().toISOString(),
        env: process.env.NODE_ENV,
        // db: dbOk ? "ok" : "down",
        // cache: redisOk ? "ok" : "down",
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[health] error", err);
    return R.json(
      { status: "error", message: "health check failed", time: new Date().toISOString() },
      { status: 500 }
    );
  }
}
