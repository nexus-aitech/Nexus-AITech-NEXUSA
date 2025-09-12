// ---------- Finalize Registration ----------
// webapp/src/app/api/auth/finalize/route.ts
export const runtime = "nodejs";

import { NextResponse as R } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/security";

// اسکیما برای ولیدیشن
const finalizeSchema = z.object({
  userId: z.string().uuid(),
  password: z.string().min(8).max(128),
});

// TODO: این‌ها باید به لایه DB واقعی وصل بشن
async function findPendingUser(userId: string) {
  // چک کن که user قبلاً در DB ساخته شده و هنوز finalize نشده
  return { id: userId, emailVerified: true, phoneVerified: true, kycApproved: true };
}
async function activateUser(userId: string, passwordHash: string) {
  // DB update → ذخیره‌ی passwordHash + تغییر وضعیت به active
  return { id: userId, active: true };
}

export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = finalizeSchema.safeParse(raw);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join("؛ ");
      return R.json({ error: message }, { status: 400 });
    }
    const { userId, password } = parsed.data;

    // چک کن کاربر pending موجود باشه
    const pending = await findPendingUser(userId);
    if (!pending) {
      return R.json({ error: "User not found or already active" }, { status: 404 });
    }

    // حتماً مطمئن شو همه‌ی وریفیکیشن‌ها کامل هستن
    if (!pending.emailVerified || !pending.phoneVerified || !pending.kycApproved) {
      return R.json({ error: "Verification incomplete" }, { status: 403 });
    }

    // هش کردن پسورد با Argon2id (lib/security)
    const passwordHash = await hashPassword(password);

    // فعال کردن کاربر در DB
    const user = await activateUser(userId, passwordHash);

    return R.json({ ok: true, userId: user.id });
  } catch (err: any) {
    console.error("[auth/finalize] error", { message: err?.message, stack: err?.stack });
    return R.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
