// =============================================================
// SIGNUP WIZARD PAGE — webapp/src/app/signup/page.tsx
// =============================================================
"use client"
import React, { useMemo, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Script from "next/script";
import { motion } from "framer-motion";
import { Check, Shield, Clock, CreditCard, Zap, ArrowRight, X, Info, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

// --- Plan Model ---
const PLANS = [
  {
    id: "trial", // internal only
    name: "48h Free Trial",
    price: 0,
    currency: "USD",
    quotaPercent: 30,
    description: "Try all core features with 30% usage cap for 48 hours.",
    features: [
      "Core analytics access",
      "Limited API calls (30% of base)",
      "Email verification required",
    ],
    cta: "Start 48h Trial",
    stripePriceId: null, // handled by trial endpoint
    highlight: false,
  },
  {
    id: "basic",
    name: "Basic",
    price: 49,
    currency: "USD",
    quotaPercent: 30,
    description: "Cost‑effective plan for getting started.",
    features: [
      "All core features",
      "30% usage allowance",
      "Community support",
    ],
    cta: "Choose Basic",
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_BASIC || "price_basic_placeholder",
    highlight: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: 99,
    currency: "USD",
    quotaPercent: 65,
    description: "Advanced features with higher quotas.",
    features: [
      "Priority features",
      "65% usage allowance",
      "Priority support",
    ],
    cta: "Choose Pro",
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO || "price_pro_placeholder",
    highlight: true,
  },
  {
    id: "custom",
    name: "Custom",
    priceRange: "$500–$5000",
    currency: "USD",
    quotaPercent: 100,
    description: "Tailored limits (100%), SLA, onboarding, and dedicated support.",
    features: [
      "100% usage allowance",
      "Custom SLAs & onboarding",
      "Dedicated manager",
    ],
    cta: "Talk to Sales",
    stripePriceId: null, // handled by contact flow
    highlight: false,
  },
] as const;

type PlanId = typeof PLANS[number]["id"];

// --- Utility ---
const cn = (...classes: (string | false | undefined)[]) => classes.filter(Boolean).join(" ");

// --- Page Component ---
export default function SignupPage() {
  const params = useSearchParams();
  const router = useRouter();
  const initialEmail = params.get("email") || "";
  const preselect = (params.get("plan") as PlanId) || undefined;

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(preselect || "trial");
  const [marketingOptIn, setMarketingOptIn] = useState(true);

  useEffect(() => {
    if (preselect) setSelectedPlan(preselect);
  }, [preselect]);

  const selectedPlanObj = useMemo(() => PLANS.find((p) => p.id === selectedPlan)!, [selectedPlan]);

  const validate = () => {
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "Email is invalid";
    if (selectedPlan !== "trial" && password.length < 8) return "Password must be at least 8 characters";
    if (!agree) return "Please accept Terms & Privacy";
    return null;
  };

  async function handleSignupAndProceed() {
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setLoading(true);
    try {
      // 1) Create account (email/password). You may replace with your existing auth route.
      const signupRes = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, marketingOptIn }),
      });
      if (!signupRes.ok) {
        const t = await signupRes.text();
        throw new Error(t || "Signup failed");
      }

      // 2) If trial → kick off trial provisioning. Else → go Stripe checkout.
      if (selectedPlan === "trial") {
        const trialRes = await fetch("/api/billing/start-trial", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (!trialRes.ok) {
          const t = await trialRes.text();
          throw new Error(t || "Trial activation failed");
        }
        router.replace("/onboarding?trial=1");
        return;
      }

      // Stripe Checkout session for recurring plans
      const planPriceId = selectedPlanObj.stripePriceId;
      if (!planPriceId) throw new Error("Stripe price not configured for this plan");

      const checkoutRes = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId: planPriceId, email, plan: selectedPlan }),
      });
      if (!checkoutRes.ok) {
        const t = await checkoutRes.text();
        throw new Error(t || "Failed to start checkout");
      }
      const { checkoutUrl } = await checkoutRes.json();
      if (!checkoutUrl) throw new Error("No checkout URL returned");
      window.location.href = checkoutUrl;
    } catch (e: any) {
      setError(e.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  function handleOAuth(provider: "google" | "github") {
    // Delegate to your OAuth route
    window.location.href = `/api/auth/oauth/${provider}?next=/signup`;
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-background to-muted px-4">
      {/* JSON-LD for SEO */}
      <Script id="signup-ld" type="application/ld+json" dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "NEXUSA",
          offers: [
            {"@type": "Offer", name: "Trial 48h", price: 0, priceCurrency: "USD"},
            {"@type": "Offer", name: "Basic", price: 49, priceCurrency: "USD"},
            {"@type": "Offer", name: "Pro", price: 99, priceCurrency: "USD"},
          ],
        }),
      }} />

      <div className="mx-auto max-w-6xl py-10 md:py-16">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="mb-8 flex flex-col items-center text-center">
          <Badge variant="secondary" className="mb-3">Secure Sign Up</Badge>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Create your account</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            48h free trial with 30% usage cap. Upgrade anytime to Basic (30%), Pro (65%), or Custom (100%).
          </p>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Left: Form */}
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35 }}>
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle>Sign up with email</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Min 8 characters. We hash with Argon2/Bcrypt on server.</p>
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Switch id="marketing" checked={marketingOptIn} onCheckedChange={setMarketingOptIn} />
                    <Label htmlFor="marketing" className="cursor-pointer">Send me product updates</Label>
                  </div>
                  <Badge variant="outline">Optional</Badge>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <input id="terms" type="checkbox" className="h-4 w-4" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  <Label htmlFor="terms" className="cursor-pointer">
                    I agree to the <a className="underline" href="/legal/terms" target="_blank">Terms</a> and <a className="underline" href="/legal/privacy" target="_blank">Privacy</a>
                  </Label>
                </div>

                {error && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                    <X className="mt-0.5 h-4 w-4" />
                    <p>{error}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Button variant="secondary" onClick={() => handleOAuth("google")} className="w-full" disabled={loading}>
                    Continue with Google
                  </Button>
                  <Button variant="secondary" onClick={() => handleOAuth("github")} className="w-full" disabled={loading}>
                    Continue with GitHub
                  </Button>
                </div>

                <Separator orientation="horizontal" className="my-2" />

                <Button onClick={handleSignupAndProceed} className="w-full" disabled={loading}>
                  {selectedPlan === "trial" ? (
                    <>
                      <Clock className="mr-2 h-4 w-4" /> Start 48h Trial
                    </>
                  ) : (
                    <>
                      <CreditCard className="mr-2 h-4 w-4" /> Continue to Checkout
                    </>
                  )}
                </Button>

                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" />
                  <span>Card data never touches our servers. Stripe Checkout + 3D Secure.</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Right: Plans */}
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35 }} className="space-y-4">
            <div className="rounded-2xl border p-4">
              <div className="mb-2 flex items-center gap-2">
                <Shield className="h-5 w-5" />
                <p className="text-sm font-medium">Plans & Limits</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Choose a plan now or start the 48h free trial. Usage caps are enforced per billing period.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {PLANS.map((p) => (
                <button
                  key={p.id}
                  className={cn(
                    "text-left rounded-2xl border p-4 transition hover:shadow-md",
                    selectedPlan === p.id && "ring-2 ring-primary",
                    p.highlight && "bg-primary/5"
                  )}
                  onClick={() => setSelectedPlan(p.id as PlanId)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {p.highlight ? <Zap className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                      <span className="font-medium">{p.name}</span>
                    </div>
                    {p.id !== "custom" ? (
                      <span className="text-sm font-semibold">{p.price === 0 ? "Free" : `$${p.price}/mo`}</span>
                    ) : (
                      <span className="text-sm font-semibold">{p.priceRange}</span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">Usage cap: {p.quotaPercent}%</div>
                  <ul className="mt-3 space-y-1 text-sm">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-center gap-2">
                        <Check className="h-4 w-4" /> {f}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-3">
                    <Badge variant={p.highlight ? "default" : "secondary"}>{p.cta}</Badge>
                  </div>
                </button>
              ))}
            </div>

            <Card>
              <CardContent className="space-y-2 p-4 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4" />
                  <p>
                    Hitting your cap pauses non-essential features until next cycle or upgrade. Custom includes 100% usage,
                    SLAs, and dedicated onboarding.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
