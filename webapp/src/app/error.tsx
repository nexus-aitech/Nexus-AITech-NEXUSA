// webapp/src/app/error.tsx
"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void; }) {
  useEffect(() => {
    // می‌تونی اینجا لاگ سفارشی/ارسال به Sentry داشته باشی
    // console.error(error);
  }, [error]);

  return (
    <main dir="rtl" className="min-h-[70vh] grid place-items-center px-6 text-center">
      <div>
        <h1 className="text-3xl font-extrabold mb-2">اوه! مشکلی پیش آمده</h1>
        <p className="text-white/70 mb-6">اگر مشکل ادامه داشت به پشتیبانی اطلاع دهید. {error?.digest ? `کد: ${error.digest}` : ""}</p>
        <button onClick={() => reset()} className="rounded-md bg-white text-black px-4 py-2 font-semibold">
          تلاش مجدد
        </button>
      </div>
    </main>
  );
}
