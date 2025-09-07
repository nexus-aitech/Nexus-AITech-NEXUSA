// webapp/components/signup-section.tsx
"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signupSchema, type SignupInput } from "@/lib/validation/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
// اگر می‌خواهی از دکمه‌ی آماده خودت استفاده کنی این را باز کن:
// import { Primary } from "@/components/ui/Button";
import { useRouter } from "next/navigation";

function strengthScore(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score; // 0..5
}

export default function SignupSection() {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "", fullName: "", agree: false },
    mode: "onChange",
  });

  const pwStrength = strengthScore(form.watch("password"));

  async function onSubmit(values: SignupInput) {
    setServerError(null);
    setLoading(true);
    try {
      // مسیر درست API در پروژه‌ی تو:
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "ثبت‌نام ناموفق بود");
      router.push("/verify?email=" + encodeURIComponent(values.email));
    } catch (err: any) {
      setServerError(err?.message ?? "خطای ناشناخته");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div dir="rtl" className="min-h-[80vh] grid place-items-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-extrabold">
            ساخت حساب NEXUSA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm">نام و نام خانوادگی</label>
              <input
                type="text"
                className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 outline-none"
                {...form.register("fullName")}
              />
              {form.formState.errors.fullName && (
                <p className="text-red-400 text-xs">
                  {form.formState.errors.fullName.message as string}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm">ایمیل</label>
              <input
                type="email"
                className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 outline-none"
                {...form.register("email")}
              />
              {form.formState.errors.email && (
                <p className="text-red-400 text-xs">
                  {form.formState.errors.email.message as string}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm">رمز عبور</label>
              <input
                type="password"
                className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 outline-none"
                {...form.register("password")}
              />
              <div className="h-1 w-full bg-white/10 rounded">
                <div
                  className="h-1 rounded bg-white/70"
                  style={{ width: `${(pwStrength / 5) * 100}%` }}
                />
              </div>
              {form.formState.errors.password && (
                <p className="text-red-400 text-xs">
                  {form.formState.errors.password.message as string}
                </p>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...form.register("agree")} />
              <span>شرایط استفاده را می‌پذیرم</span>
            </label>
            {form.formState.errors.agree && (
              <p className="text-red-400 text-xs">
                {form.formState.errors.agree.message as string}
              </p>
            )}

            {serverError && (
              <p className="text-red-400 text-sm">{serverError}</p>
            )}

            <button
              type="submit"
              disabled={loading || !form.formState.isValid}
              className="w-full rounded-md bg-white text-black py-2 font-semibold disabled:opacity-50"
            >
              {loading ? "در حال ارسال…" : "ساخت حساب"}
            </button>
            {/* در صورت تمایل از دکمه‌ی خودت استفاده کن:
            <Primary type="submit" disabled={loading || !form.formState.isValid}>
              {loading ? "در حال ارسال…" : "ساخت حساب"}
            </Primary>
            */}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
