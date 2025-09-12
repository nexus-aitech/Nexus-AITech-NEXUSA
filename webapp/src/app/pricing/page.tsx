"use client";
import { Card } from "@/components/ui/Card";
import { Primary, Ghost } from "@/components/ui/Button";

export const metadata = { title: "پلن‌ها – NEXUSA" };

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 space-y-6">
      <h1 className="text-2xl font-bold text-white">پلن‌ها</h1>
      <div className="grid md:grid-cols-3 gap-4">
        <Card title="Basic" footer={<Primary>$49 / ماه – شروع</Primary>}>
          ۱ فضای پروژه، ۵ سیگنال هم‌زمان، گزارش‌های پایه.
        </Card>
        <Card title="Pro" footer={<Primary>$99 / ماه – انتخاب</Primary>}>
          ۵ فضای پروژه، ۲۰ سیگنال هم‌زمان، بک‌تست پیشرفته، پشتیبانی اولویت‌دار.
        </Card>
        <Card title="Custom" footer={<Ghost>تماس با فروش</Ghost>}>
          برای سازمان‌ها: SLA، اتصال اختصاصی (۵۰۰ تا ۵۰۰۰ دلار/ماه).
        </Card>
      </div>
    </div>
  );
}
