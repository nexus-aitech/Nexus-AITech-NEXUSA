"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Script from "next/script";
import { motion } from "framer-motion";
import { Check, CreditCard, Clock, Lock, Mail, Github, Chrome, XCircle, Info, ShieldCheck, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export type SignupSectionProps = {
  redirectOnDone?: string; // default "/onboarding"
};

const PLANS = [
  { id: "trial", name: "48h Free Trial", price: 0, quotaPercent: 30, cta: "Start Trial", highlight: false },
  { id: "basic", name: "Basic", price: 49, quotaPercent: 30, cta: "Choose Basic", highlight: false, priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_BASIC || "price_basic_placeholder" },
  { id: "pro", name: "Pro", price: 99, quotaPercent: 65, cta: "Go Pro", highlight: true, priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO || "price_pro_placeholder" },
  { id: "custom", name: "Custom", priceRange: "$500–$5000", quotaPercent: 100, cta: "Contact Sales", highlight: false },
] as const;

type PlanId = typeof PLANS[number]["id"];

export function SignupSection({ redirectOnDone = "/onboarding" }: SignupSectionProps) {
  const params = useSearchParams();
  const router = useRouter();

  const preselect = (params.get("plan") as PlanId) || (params.get("p") as PlanId) || "trial";
  const initialEmail = params.get("email") || "";

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [optIn, setOptIn] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(preselect);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (preselect) setSelectedPlan(preselect);
  }, [preselect]);

  const selectedPlanObj = useMemo(() => PLANS.find(p => p.id === selectedPlan)!, [selectedPlan]);

  function validate() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "Please enter a valid email";
    if (selectedPlan !== "trial" && password.length < 8) return "Password must be at least 8 characters";
    if (!agree) return "Please accept Terms & Privacy";
    return null;
  }

  async function createAccount() {
    const v = validate();
    if (v) { setError(v); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, optIn }),
      });
      if (!res.ok) throw new Error(await res.text());

      if (selectedPlan === "trial") {
        const t = await fetch("/api/billing/start-trial", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, quotaPercent: 30, hours: 48 }),
        });
        if (!t.ok) throw new Error(await t.text());
        router.replace(`${redirectOnDone}?trial=1`);
        return;
      }

      if (selectedPlan === "custom") {
        router.push("/contact?topic=sales&ref=signup");
        return;
      }

      const priceId = (selectedPlanObj as any).priceId as string | undefined;
      if (!priceId) throw new Error("Stripe price is not configured");

      const checkout = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, email, plan: selectedPlan }),
      });
      if (!checkout.ok) throw new Error(await checkout.text());
      const { checkoutUrl } = await checkout.json();
      if (!checkoutUrl) throw new Error("No checkout URL returned");
      window.location.href = checkoutUrl;
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function oauth(provider: "google" | "github") {
    window.location.href = `/api/auth/oauth/${provider}?next=/signup`;
  }

  return (
    <section className="w-full">
      {/* SEO: offers */}
      <Script id="signup-offers" type="application/ld+json" dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "NEXUSA",
          offers: [
            { "@type": "Offer", name: "Trial 48h", price: 0, priceCurrency: "USD" },
            { "@type": "Offer", name: "Basic", price: 49, priceCurrency: "USD" },
            { "@type": "Offer", name: "Pro", price: 99, priceCurrency: "USD" }
          ]
        })
      }} />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Form */}
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Create your account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60" />
                  <Input id="email" type="email" className="pl-8" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
                <p className="text-xs text-white/60">Min 8 characters. Server hashes with Argon2/Bcrypt.</p>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Switch id="optin" checked={optIn} onCheckedChange={setOptIn} />
                  <Label htmlFor="optin" className="cursor-pointer">Send me product updates</Label>
                </div>
                <Badge variant="outline">Optional</Badge>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <input id="agree" type="checkbox" className="h-4 w-4" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <Label htmlFor="agree" className="cursor-pointer">
                  I agree to the <a className="underline" href="/legal/terms" target="_blank">Terms</a> and <a className="underline" href="/legal/privacy" target="_blank">Privacy</a>
                </Label>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                  <XCircle className="h-4 w-4"/> {error}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Button variant="secondary" onClick={() => oauth("google")} disabled={loading}>
                  <Chrome className="mr-2 h-4 w-4"/> Continue with Google
                </Button>
                <Button variant="secondary" onClick={() => oauth("github")} disabled={loading}>
                  <Github className="mr-2 h-4 w-4"/> Continue with GitHub
                </Button>
              </div>

              <Separator />

              <Button onClick={createAccount} className="w-full" disabled={loading}>
                {selectedPlan === "trial" ? (<><Clock className="mr-2 h-4 w-4"/> Start 48h Trial</>) : selectedPlan === "custom" ? (<><Zap className="mr-2 h-4 w-4"/> Contact Sales</>) : (<><CreditCard className="mr-2 h-4 w-4"/> Continue to Checkout</>)}
              </Button>

              <div className="mt-2 flex items-center gap-2 text-xs text-white/60">
                <Lock className="h-3.5 w-3.5" /> Card data never touches our servers. Stripe Checkout + 3D Secure.
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Plans */}
        <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }} className="space-y-4">
          <div className="rounded-2xl border p-4">
            <div className="mb-2 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              <p className="text-sm font-medium">Plans & Limits</p>
            </div>
            <p className="text-sm text-white/70">Choose a plan or start the 48h free trial. Usage caps are enforced per billing period.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {PLANS.map((p) => (
              <button key={p.id} onClick={() => setSelectedPlan(p.id as PlanId)} className={`text-left rounded-2xl border p-4 transition hover:shadow-md ${selectedPlan === p.id ? "ring-2 ring-primary" : ""} ${p.highlight ? "bg-primary/5" : ""}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4"/>
                    <span className="font-medium">{p.name}</span>
                  </div>
                  {p.id !== "custom" ? (
                    <span className="text-sm font-semibold">{p.price === 0 ? "Free" : `$${p.price}/mo`}</span>
                  ) : (
                    <span className="text-sm font-semibold">{(p as any).priceRange}</span>
                  )}
                </div>
                <div className="mt-1 text-xs text-white/60">Usage cap: {p.quotaPercent}%</div>
                <ul className="mt-3 space-y-1 text-sm">
                  <li className="flex items-center gap-2"><Check className="h-4 w-4"/> Core features</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4"/> API access</li>
                  {p.id === "pro" && (<li className="flex items-center gap-2"><Check className="h-4 w-4"/> Priority support</li>)}
                  {p.id === "custom" && (<li className="flex items-center gap-2"><Check className="h-4 w-4"/> Dedicated manager & SLA</li>)}
                </ul>
                <div className="mt-3">
                  <Badge variant={p.highlight ? "default" : "secondary"}>{p.cta}</Badge>
                </div>
              </button>
            ))}
          </div>

          <Card>
            <CardContent className="space-y-2 p-4 text-sm text-white/70">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4" />
                <p>Hitting your cap pauses non‑essential features until the next cycle or upgrade. Custom includes 100% usage, SLAs, and onboarding.</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}

export default SignupSection;
