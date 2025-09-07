import { Card } from "@/components/ui/Card";

export const metadata = { title: "راهنما – NEXUSA" };

export default function AboutPage() {
  const steps = [
    "اتصال API صرافی‌ها (Binance/Bybit/OKX/KuCoin/Bitget/CoinEx)",
    "Ingestion → Storage → Feature Engine → Signal Engine",
    "بک‌تست، ارزیابی عملکرد، بهینه‌سازی پارامتر",
    "LLM Reporting و انتشار گزارش",
  ];
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 space-y-6">
      <h1 className="text-2xl font-bold text-white">راهنمای سریع</h1>
      <div className="grid md:grid-cols-2 gap-4">
        {steps.map((s, i) => (
          <Card key={i} title={`گام ${i + 1}`}>{s}</Card>
        ))}
      </div>
      <div className="rounded-2xl border border-white/10 p-5 text-white/80 text-sm">
        راهنمای کامل‌تر به‌زودی افزوده می‌شود. از «پلن‌ها» شروع کنید و ثبت‌نام کنید.
      </div>
    </div>
  );
}
