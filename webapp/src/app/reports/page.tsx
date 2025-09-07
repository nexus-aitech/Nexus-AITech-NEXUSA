import { Card } from "@/components/ui/Card";

export const metadata = { title: "گزارش‌ها – NEXUSA" };

export default function ReportsPage() {
  const items = [
    { title: "بازده سیگنال BTC/USDT", date: "۱۴۰۴/۰۶/۱۴", status: "Ready" },
    { title: "ریسک-بازده مجموعه پرتفوی", date: "۱۴۰۴/۰۶/۱۰", status: "Draft" },
    { title: "تحلیل شکست سطح ETH", date: "۱۴۰۴/۰۶/۰۸", status: "Ready" },
  ];
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 space-y-6">
      <h1 className="text-2xl font-bold text-white">گزارش‌ها</h1>
      <div className="grid md:grid-cols-3 gap-4">
        {items.map((it, idx) => (
          <Card key={idx} title={it.title} footer={
            <a className="rounded-2xl px-3 py-1.5 border border-white/20 text-white/90 hover:border-white/40">مشاهده</a>
          }>
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/50">{it.date}</span>
              <span className="rounded-full border border-white/20 px-2 py-0.5 text-white/70">{it.status}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
