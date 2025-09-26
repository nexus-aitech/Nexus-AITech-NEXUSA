"use client";

// ================================================================
// NEXUSA — Pricing / Plans (Pro)
// • Ultra‑modern SaaS pricing with glassmorphism cards
// • Monthly / Yearly toggle (+2 months free on yearly)
// • Feature comparison table
// • 48h Free Trial CTA
// • Stripe checkout wiring (client → /api/billing/create-checkout-session)
// • FAQ accordion + Trust badges
// NOTE: Keep backend as is; env vars for prices are read at runtime.
// ================================================================

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Check,
  Star,
  Rocket,
  ShieldCheck,
  Sparkles,
  CreditCard,
  CalendarDays,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

// ---- Stripe price IDs (Monthly/Yearly)
const PRICE_IDS = {
  basic: {
    monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_BASIC_MONTHLY || "price_basic_m_placeholder",
    yearly: process.env.NEXT_PUBLIC_STRIPE_PRICE_BASIC_YEARLY || "price_basic_y_placeholder",
  },
  pro: {
    monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY || "price_pro_m_placeholder",
    yearly: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY || "price_pro_y_placeholder",
  },
};

const PLANS = [
  {
    id: "basic" as const,
    name: "Basic",
    desc: "برای شروع با دسترسی محدود ۳۰٪.",
    priceMonthly: 49,
    priceYearly: 490, // ~2 months free
    features: [
      "1 فضای کاری پروژه",
      "حداکثر 5 سیگنال همزمان",
      "گزارش‌های پایه AI",
      "پشتیبانی جامعه کاربری",
    ],
    highlight: false,
  },
  {
    id: "pro" as const,
    name: "Pro",
    desc: "حرفه‌ای‌ها با دسترسی ۷۰٪ و بک‌تست پیشرفته.",
    priceMonthly: 99,
    priceYearly: 990, // ~2 months free
    features: [
      "5 فضای کاری پروژه",
      "حداکثر 20 سیگنال همزمان",
      "بک‌تست پیشرفته + KPI",
      "اولویت پشتیبانی",
    ],
    highlight: true,
  },
  {
    id: "custom" as const,
    name: "Custom",
    desc: "کامل‌ترین دسترسی (۱۰۰٪) برای شرکت‌ها.",
    priceMonthly: null,
    priceYearly: null,
    features: [
      "مصرف نامحدود",
      "SLA اختصاصی",
      "یکپارچه‌سازی خصوصی",
      "مدیر حساب اختصاصی",
    ],
    highlight: false,
  },
];

type PlanId = (typeof PLANS)[number]["id"];

export default function PricingPagePro() {
  const [billingYearly, setBillingYearly] = useState(true);
  const [loading, setLoading] = useState<PlanId | null>(null);

  const priceLabel = (p: number | null) => {
    if (p == null) return "تماس بگیرید";
    return billingYearly ? `$${p}/y` : `$${p}/mo`;
  };

  const subtitle = useMemo(() => (
    billingYearly ? "صورت‌حساب سالانه (۲ ماه رایگان)" : "صورت‌حساب ماهانه"
  ), [billingYearly]);

  async function handleCheckout(plan: PlanId) {
    // Custom → contact
    if (plan === "custom") { window.location.href = "/contact"; return; }
    setLoading(plan);
    try {
      const priceId = PRICE_IDS[plan][billingYearly ? "yearly" : "monthly"];
      const res = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, plan, billing: billingYearly ? "yearly" : "monthly" }),
      });
      if (!res.ok) throw new Error("Failed to create checkout session");
      const { checkoutUrl } = await res.json();
      if (checkoutUrl) window.location.href = checkoutUrl;
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[radial-gradient(1200px_600px_at_80%_-10%,rgba(56,189,248,.12),rgba(0,0,0,0)),radial-gradient(1000px_500px_at_10%_110%,rgba(168,85,247,.12),rgba(0,0,0,0))] px-4 py-12">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="text-center">
          <Badge variant="secondary" className="mb-3">Pricing</Badge>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white">پلن خودتان را انتخاب کنید</h1>
          <p className="mt-2 text-white/70 max-w-2xl mx-auto">
            پلن‌های منعطف برای افراد، حرفه‌ای‌ها و شرکت‌ها. آزمایش رایگان ۴۸ ساعته با ۳۰٪ دسترسی.
          </p>

          {/* Billing toggle */}
          <div className="mt-6 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-2">
            <CalendarDays className="h-4 w-4"/>
            <span className="text-sm">{subtitle}</span>
            <Separator orientation="vertical" className="mx-2 h-6"/>
            <Label className="text-xs">Monthly</Label>
            <Switch checked={billingYearly} onCheckedChange={setBillingYearly} />
            <Label className="text-xs">Yearly</Label>
            {billingYearly && <Badge variant="outline" className="ml-2">2 ماه رایگان</Badge>}
          </div>
        </motion.div>

        {/* Plan cards */}
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {PLANS.map((plan, idx) => (
            <motion.div key={plan.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: idx * 0.05 }}>
              <Card className={`relative h-full rounded-2xl border backdrop-blur-[2px] shadow-[inset_0_1px_0_rgba(255,255,255,.06),0_25px_60px_-30px_rgba(99,102,241,.35)] ${plan.highlight ? "ring-2 ring-primary border-primary" : "border-white/10 bg-white/[0.04]"}`}>
                {plan.highlight && (
                  <div className="absolute -top-3 right-3"><Badge className="gap-1"><Star className="h-3.5 w-3.5"/> محبوب</Badge></div>
                )}
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="text-lg font-semibold">{plan.name}</span>
                  </CardTitle>
                  <p className="text-white/70 text-sm mt-1">{plan.desc}</p>
                </CardHeader>
                <CardContent className="flex flex-col justify-between h-full">
                  <div className="space-y-3">
                    <p className="text-3xl font-extrabold tracking-tight">{priceLabel(billingYearly ? plan.priceYearly : plan.priceMonthly)}</p>
                    <ul className="mt-3 space-y-2 text-sm text-white/80">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> {f}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-6">
                    <Button className="w-full" onClick={() => handleCheckout(plan.id)} disabled={loading === plan.id}>
                      {plan.id === "custom" ? "تماس با فروش" : loading === plan.id ? "در حال انتقال…" : plan.id === "pro" ? "شروع Pro" : "شروع Basic"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Comparison table */}
        <div className="mt-14">
          <h2 className="text-xl font-semibold flex items-center gap-2"><Sparkles className="h-5 w-5"/> مقایسهٔ امکانات</h2>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  <th className="p-3">قابلیت</th>
                  <th className="p-3">Basic</th>
                  <th className="p-3">Pro</th>
                  <th className="p-3">Custom</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["دسترسی پلتفرم", "30%", "70%", "100%"],
                  ["سیگنال‌های زنده", true, true, true],
                  ["گزارش‌های AI", "پایه", "پیشرفته", "کامل"],
                  ["بک‌تست و KPI", "محدود", "پیشرفته", "کامل"],
                  ["Gamification/Community", true, true, true],
                  ["SLA/حساب مدیر", false, false, true],
                ].map((row, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="p-3 text-white/80">{row[0] as string}</td>
                    {[1,2,3].map((col) => (
                      <td key={col} className="p-3">
                        {typeof row[col] === "boolean" ? (
                          row[col] ? <Check className="h-4 w-4 text-emerald-400"/> : <span className="text-white/40">—</span>
                        ) : (
                          <span className="text-white/80">{row[col] as string}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Trial CTA */}
        <div className="mt-14 max-w-4xl mx-auto">
          <Card className="p-6 text-center border-white/10 bg-white/[0.04]">
            <CardHeader>
              <CardTitle className="flex items-center justify-center gap-2 text-lg"><Rocket className="h-5 w-5 text-primary" /> آزمایش رایگان ۴۸ ساعته</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-white/80">
              <p>بدون کارت بانکی—۳۰٪ دسترسی به هستهٔ پلتفرم برای ۴۸ ساعت.</p>
              <Button asChild size="lg"><Link href="/signup?plan=trial">Start Free Trial</Link></Button>
            </CardContent>
          </Card>
        </div>

        {/* Trust */}
        <div className="mt-10 text-xs text-white/70 flex items-center justify-center gap-2">
          <ShieldCheck className="h-4 w-4" /> پرداخت‌ها با Stripe امن هستند؛ اطلاعات کارت شما روی سرور ما ذخیره نمی‌شود.
        </div>

        {/* FAQ */}
        <div className="mt-14 max-w-3xl mx-auto">
          <h3 className="text-lg font-semibold mb-3">سوالات متداول</h3>
          <Accordion type="single" collapsible className="bg-white/[0.03] rounded-2xl border border-white/10">
            <AccordionItem value="q1">
              <AccordionTrigger>اگر وسط ماه ارتقا بدهم چه می‌شود؟</AccordionTrigger>
              <AccordionContent>Stripe به صورت خودکار مبلغ استفاده‌شده را محاسبه و اعتبار باقیمانده را به پلن جدید منتقل می‌کند.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="q2">
              <AccordionTrigger>آیا هر زمان می‌توانم لغو کنم؟</AccordionTrigger>
              <AccordionContent>بله، لغو فوری است و دسترسی تا پایان دورهٔ پرداختی فعلی فعال می‌ماند.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="q3">
              <AccordionTrigger>آیا مالیات/VAT اعمال می‌شود؟</AccordionTrigger>
              <AccordionContent>بر اساس محل سکونت کاربر و قوانین درگاه پرداخت ممکن است VAT جداگانه محاسبه شود.</AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>
    </div>
  );
}