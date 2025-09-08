// webapp/src/app/not-found.tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <main dir="rtl" className="min-h-[70vh] grid place-items-center px-6 text-center">
      <div>
        <h1 className="text-3xl font-extrabold mb-2">صفحه پیدا نشد (۴۰۴)</h1>
        <p className="text-white/70 mb-6">ممکن است آدرس جابه‌جا شده باشد یا صفحه حذف شده باشد.</p>
        <Link href="/" className="inline-block rounded-md bg-white text-black px-4 py-2 font-semibold">
          بازگشت به خانه
        </Link>
      </div>
    </main>
  );
}
