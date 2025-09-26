"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  User2,
  Mail,
  Phone,
  Globe2,
  Building2,
  CalendarClock,
  ImageUp,
  Save,
  Loader2,
  Shield,
  ShieldCheck,
  KeyRound,
  QrCode,
  LogOut,
  CreditCard,
  FileText,
  CheckCircle2,
  AlertCircle,
  Settings2,
  Bell,
  Link as LinkIcon,
  Moon,
  SunMedium,
  Languages,
  Trash2,
  Edit3,
  Copy,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------
interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  website?: string;
  bio?: string;
  location?: string;
  avatar_url?: string;
  created_at: string; // ISO
}

interface Subscription {
  status: "trialing" | "active" | "past_due" | "canceled" | "incomplete";
  plan_id: string;
  plan_name: string;
  renews_at?: string; // ISO
  cancel_at?: string; // ISO
  currency: string;
  unit_amount: number; // cents
}

interface Invoice {
  id: string;
  created_at: string; // ISO
  amount_due: number; // cents
  currency: string;
  status: "paid" | "open" | "uncollectible" | "void";
  hosted_invoice_url?: string;
  pdf_url?: string;
}

interface Integration {
  id: string;
  name: string;
  connected: boolean;
  hint?: string;
  doc_url?: string;
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
const fmtMoney = (cents: number, currency: string) =>
  new Intl.NumberFormat("fa-IR", { style: "currency", currency }).format(cents / 100);

const dateHuman = (iso?: string) => (iso ? new Date(iso).toLocaleString("fa-IR") : "—");

// Local persistence (optimistic UI fallbacks)
const LOCAL_PROFILE_KEY = "nexusa:profile:draft";

function loadLocal<T>(k: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveLocal<T>(k: string, v: T) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
}

// ------------------------------------------------------------
// Main Page
// ------------------------------------------------------------
export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [me, setMe] = useState<UserProfile | null>(null);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);

  // Settings
  const [themeDark, setThemeDark] = useState(true);
  const [lang, setLang] = useState("fa");
  const [notifications, setNotifications] = useState({
    product: true,
    security: true,
    digest: false,
  });

  // Security
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [twoFAQr, setTwoFAQr] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  // Avatar upload state (presigned flow placeholder)
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Draft (for optimistic edit)
  const [draft, setDraft] = useState<UserProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        // parallel loads
        const [meRes, subRes, invRes, intRes, secRes] = await Promise.all([
          api<UserProfile>("/user/me", { method: "GET" }),
          api<Subscription | null>("/billing/subscription", { method: "GET" }),
          api<Invoice[]>("/billing/invoices", { method: "GET" }),
          api<Integration[]>("/integrations", { method: "GET" }),
          api<{ twofa: boolean }>("/auth/2fa/status", { method: "GET" }),
        ]);
        if (cancelled) return;
        setMe(meRes);
        setDraft(loadLocal<UserProfile | null>(LOCAL_PROFILE_KEY, meRes));
        setSub(subRes);
        setInvoices(invRes);
        setIntegrations(intRes);
        setTwoFAEnabled(!!secRes?.twofa);
      } catch (e: any) {
        // graceful fallback demo mode
        const demo: UserProfile = {
          id: "demo",
          name: "الیاس — NEXUSA",
          email: "elyas@nexusa.ai",
          phone: "+98-900-000-0000",
          company: "NEXUSA",
          website: "https://nexusa.ai",
          bio: "معمار پلتفرم‌های تحلیلی و هوش مصنوعی.",
          location: "Tehran, IR",
          avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
          created_at: new Date().toISOString(),
        };
        setMe(demo);
        setDraft(loadLocal<UserProfile | null>(LOCAL_PROFILE_KEY, demo));
        setSub({ status: "active", plan_id: "pro", plan_name: "PRO", renews_at: new Date(Date.now() + 30*86400e3).toISOString(), currency: "USD", unit_amount: 4900 });
        setInvoices([
          { id: "inv_01", created_at: new Date().toISOString(), amount_due: 4900, currency: "USD", status: "paid", hosted_invoice_url: "#" },
        ]);
        setIntegrations([
          { id: "binance", name: "Binance", connected: true, hint: "API Key active", doc_url: "#" },
          { id: "bybit", name: "Bybit", connected: false, hint: "Connect for live trading", doc_url: "#" },
        ]);
        setTwoFAEnabled(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function onDraft<K extends keyof UserProfile>(k: K, v: UserProfile[K]) {
    if (!draft) return;
    const next = { ...draft, [k]: v } as UserProfile;
    setDraft(next);
    saveLocal(LOCAL_PROFILE_KEY, next);
  }

  async function saveProfile() {
    if (!draft) return;
    try {
      setSaving(true);
      const next = await api<UserProfile>("/user/update", { method: "POST", body: JSON.stringify(draft) });
      setMe(next);
      setDraft(next);
      saveLocal(LOCAL_PROFILE_KEY, next);
    } catch (e) {
      // toast error in real app
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file: File) {
    try {
      setAvatarUploading(true);
      // 1) get presigned
      const up = await api<{ upload_url: string; public_url: string }>("/user/avatar", { method: "POST", body: JSON.stringify({ filename: file.name, content_type: file.type }) });
      // 2) PUT to S3/GCS (placeholder: fetch)
      await fetch(up.upload_url, { method: "PUT", body: file });
      // 3) save new url
      const next = { ...(draft as UserProfile), avatar_url: up.public_url };
      setDraft(next);
      saveLocal(LOCAL_PROFILE_KEY, next);
    } catch (e) {
      // toast error
    } finally {
      setAvatarUploading(false);
    }
  }

  async function refresh2FA() {
    const res = await api<{ otpauth_url: string }>("/auth/2fa/init", { method: "POST" });
    setTwoFAQr(res?.otpauth_url || null);
  }

  async function enable2FA(code: string) {
    const ok = await api<{ enabled: boolean }>("/auth/2fa/enable", { method: "POST", body: JSON.stringify({ code }) });
    setTwoFAEnabled(!!ok?.enabled);
  }

  async function disable2FA() {
    const ok = await api<{ disabled: boolean }>("/auth/2fa/disable", { method: "POST" });
    if (ok?.disabled) setTwoFAEnabled(false);
  }

  function statusBadge(s?: Subscription["status"]) {
    const map: Record<Subscription["status"], string> = {
      trialing: "bg-amber-500/15 text-amber-300 border-amber-500/30",
      active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
      past_due: "bg-rose-500/15 text-rose-300 border-rose-500/30",
      canceled: "bg-slate-500/15 text-slate-300 border-slate-500/30",
      incomplete: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    } as any;
    return s ? <Badge className={cn("rounded-full border px-3 py-1 text-xs", map[s])}>{s}</Badge> : null;
  }

  const isDark = themeDark; // in real app, sync with theme provider

  return (
    <div dir="rtl" className={cn("relative min-h-screen w-full text-slate-100", isDark ? "bg-[#070712]" : "bg-white text-slate-800")}> 
      {/* Background */}
      {isDark && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(124,58,237,0.2),rgba(2,6,23,0))]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:24px_24px]" />
        </div>
      )}

      <main className="relative mx-auto max-w-7xl px-4 pb-16 pt-10">
        <header className="mb-6">
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="text-2xl font-bold tracking-tight md:text-3xl">
            پروفایل کاربر
          </motion.h1>
          <p className="mt-2 max-w-3xl text-sm text-white/80">
            مدیریت اطلاعات شخصی، اشتراک‌ها و تنظیمات حساب. آمادهٔ اجرای زنده با APIهای واقعی و Fallback لوکال.
          </p>
        </header>

        <Tabs defaultValue="overview" className="mt-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">نمای کلی</TabsTrigger>
            <TabsTrigger value="account">اطلاعات شخصی</TabsTrigger>
            <TabsTrigger value="subscription">اشتراک</TabsTrigger>
            <TabsTrigger value="settings">تنظیمات</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="mt-6 grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><User2 className="h-5 w-5"/> خوش آمدید، {me?.name || "—"}</CardTitle>
                <CardDescription>خلاصه وضعیت حساب و اشتراک شما</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <div className="text-sm text-white/60">ایمیل</div>
                  <div className="mt-1 flex items-center gap-2"><Mail className="h-4 w-4"/>{me?.email}</div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-sm text-white/60">عضویت از</div>
                  <div className="mt-1 flex items-center gap-2"><CalendarClock className="h-4 w-4"/>{dateHuman(me?.created_at)}</div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-sm text-white/60">وضعیت اشتراک</div>
                  <div className="mt-1 flex items-center gap-2">{statusBadge(sub?.status)}<span>{sub?.plan_name}</span></div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-sm text-white/60">تمدید بعدی</div>
                  <div className="mt-1">{dateHuman(sub?.renews_at)}</div>
                </div>
              </CardContent>
              <CardFooter className="flex gap-2">
                <Button variant="secondary" onClick={() => window.scrollTo({ top: 9999, behavior: "smooth" })}><Settings2 className="h-4 w-4 ml-2"/> تنظیمات پیشرفته</Button>
                <Button onClick={() => (document.querySelector('[data-tab="subscription"]') as HTMLElement)?.click?.()}><CreditCard className="h-4 w-4 ml-2"/> مدیریت اشتراک</Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5"/> امنیت</CardTitle>
                <CardDescription>۲FA و نشست‌ها</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4"/> احراز هویت دومرحله‌ای</div>
                  <Badge variant={twoFAEnabled ? "default" : "secondary"}>{twoFAEnabled ? "فعال" : "غیرفعال"}</Badge>
                </div>
                <Button variant="secondary" onClick={refresh2FA}><QrCode className="h-4 w-4 ml-2"/> تولید QR جدید</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Account */}
          <TabsContent value="account" className="mt-6 grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>اطلاعات شخصی</CardTitle>
                <CardDescription>اطلاعات نمایش‌داده‌شده در حساب شما</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>نام کامل</Label>
                  <Input value={draft?.name || ""} onChange={(e) => onDraft("name", e.target.value)} placeholder="نام و نام خانوادگی" />
                </div>
                <div className="space-y-2">
                  <Label>ایمیل</Label>
                  <Input value={draft?.email || ""} onChange={(e) => onDraft("email", e.target.value)} type="email" placeholder="you@example.com" />
                </div>
                <div className="space-y-2">
                  <Label>شماره تماس</Label>
                  <Input value={draft?.phone || ""} onChange={(e) => onDraft("phone", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>شرکت</Label>
                  <Input value={draft?.company || ""} onChange={(e) => onDraft("company", e.target.value)} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>وب‌سایت</Label>
                  <Input value={draft?.website || ""} onChange={(e) => onDraft("website", e.target.value)} placeholder="https://" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>بیو</Label>
                  <Textarea value={draft?.bio || ""} onChange={(e) => onDraft("bio", e.target.value)} rows={4} placeholder="چند جمله درباره خودتان..." />
                </div>
              </CardContent>
              <CardFooter className="flex items-center gap-2">
                <Button disabled={saving} onClick={saveProfile}>{saving ? (<><Loader2 className="h-4 w-4 ml-2 animate-spin"/> درحال ذخیره</>) : (<><Save className="h-4 w-4 ml-2"/> ذخیره تغییرات</>)}</Button>
                <Button variant="secondary" onClick={() => draft && setDraft(me)}>انصراف</Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>آواتار</CardTitle>
                <CardDescription>تصویر پروفایل</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="aspect-square w-32 overflow-hidden rounded-xl border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="avatar" src={draft?.avatar_url || "/avatar-fallback.png"} className="h-full w-full object-cover" />
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm">
                  <ImageUp className="h-4 w-4"/> انتخاب تصویر
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
                </label>
                {avatarUploading && <div className="text-xs text-white/60 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin"/> در حال آپلود...</div>}
              </CardContent>
            </Card>

            <Card className="md:col-span-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5"/> امنیت حساب</CardTitle>
                <CardDescription>مدیریت رمز عبور و ۲FA</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>گذرواژه فعلی</Label>
                  <Input type="password" placeholder="••••••••" />
                </div>
                <div className="space-y-2">
                  <Label>گذرواژه جدید</Label>
                  <Input type="password" placeholder="حداقل ۸ کاراکتر" />
                </div>
                <div className="space-y-2">
                  <Label>تکرار گذرواژه جدید</Label>
                  <Input type="password" placeholder="تأیید" />
                </div>
                <div className="sm:col-span-3">
                  <Button variant="secondary"><KeyRound className="h-4 w-4 ml-2"/> بروزرسانی گذرواژه</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Subscription */}
          <TabsContent value="subscription" className="mt-6 grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5"/> مدیریت اشتراک</CardTitle>
                <CardDescription>طرح فعلی و سوابق پرداخت</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between rounded-xl border p-4">
                  <div>
                    <div className="text-sm text-white/60">طرح فعال</div>
                    <div className="mt-1 text-lg font-semibold">{sub?.plan_name} {statusBadge(sub?.status)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-white/60">تمدید بعدی</div>
                    <div className="mt-1">{dateHuman(sub?.renews_at)}</div>
                  </div>
                </div>

                <Separator className="my-4" />

                <div className="text-sm mb-2">فاکتورها</div>
                <div className="rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>تاریخ</TableHead>
                        <TableHead>مبلغ</TableHead>
                        <TableHead>وضعیت</TableHead>
                        <TableHead className="text-left">فایل</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell>{dateHuman(inv.created_at)}</TableCell>
                          <TableCell>{fmtMoney(inv.amount_due, inv.currency)}</TableCell>
                          <TableCell>
                            <Badge variant={inv.status === "paid" ? "default" : "secondary"}>{inv.status}</Badge>
                          </TableCell>
                          <TableCell className="text-left">
                            <div className="flex gap-2 justify-end">
                              {inv.hosted_invoice_url && (
                                <a href={inv.hosted_invoice_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline">
                                  <FileText className="h-4 w-4"/> مشاهده
                                </a>
                              )}
                              {inv.pdf_url && (
                                <a href={inv.pdf_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline">
                                  PDF
                                </a>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
              <CardFooter className="flex items-center gap-2">
                <Button variant="secondary">تغییر پلن</Button>
                <Button className="bg-rose-600/80 hover:bg-rose-600">لغو خودکار تمدید</Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>روش پرداخت</CardTitle>
                <CardDescription>مدیریت کارت‌ها</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4"/>
                    <div className="text-sm">VISA **** 4242</div>
                  </div>
                  <Button variant="secondary">تغییر</Button>
                </div>
                <Button variant="secondary">افزودن کارت جدید</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings */}
          <TabsContent value="settings" className="mt-6 grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5"/> تنظیمات عمومی</CardTitle>
                <CardDescription>ظاهر، زبان و اعلان‌ها</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border p-4 flex items-center justify-between">
                  <div>
                    <div className="text-sm text-white/60">حالت تیره</div>
                    <div className="text-xs text-white/50">رابط کاربری تاریک آینده‌گرا</div>
                  </div>
                  <Button variant="secondary" onClick={() => setThemeDark((v) => !v)}>{themeDark ? (<><SunMedium className="h-4 w-4 ml-2"/> روشن</>) : (<><Moon className="h-4 w-4 ml-2"/> تاریک</>)}</Button>
                </div>
                <div className="rounded-xl border p-4 flex items-center justify-between">
                  <div>
                    <div className="text-sm text-white/60">زبان</div>
                    <div className="text-xs text-white/50">Language</div>
                  </div>
                  <Select value={lang} onValueChange={setLang}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fa">فارسی</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-xl border p-4 sm:col-span-2">
                  <div className="text-sm text-white/60 mb-3 flex items-center gap-2"><Bell className="h-4 w-4"/> اعلان‌ها</div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="flex items-center justify-between rounded-lg border p-3">
                      <span className="text-sm">به‌روزرسانی‌های محصول</span>
                      <Switch checked={notifications.product} onCheckedChange={(v) => setNotifications((n) => ({ ...n, product: v }))} />
                    </label>
                    <label className="flex items-center justify-between rounded-lg border p-3">
                      <span className="text-sm">هشدارهای امنیتی</span>
                      <Switch checked={notifications.security} onCheckedChange={(v) => setNotifications((n) => ({ ...n, security: v }))} />
                    </label>
                    <label className="flex items-center justify-between rounded-lg border p-3">
                      <span className="text-sm">گزارش‌های هفتگی</span>
                      <Switch checked={notifications.digest} onCheckedChange={(v) => setNotifications((n) => ({ ...n, digest: v }))} />
                    </label>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>اتصالات</CardTitle>
                <CardDescription>اکانت‌های متصل</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {integrations.map((i) => (
                  <div key={i.id} className="rounded-lg border p-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{i.name}</div>
                      <div className="text-xs text-white/60">{i.hint}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {i.doc_url && (
                        <a className="text-xs underline inline-flex items-center gap-1" href={i.doc_url} target="_blank" rel="noreferrer"><LinkIcon className="h-3.5 w-3.5"/> مستندات</a>
                      )}
                      <Button variant={i.connected ? "secondary" : "default"}>{i.connected ? "قطع اتصال" : "اتصال"}</Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Danger zone */}
        <section className="mt-10" id="danger">
          <Card className="border-rose-700/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-rose-300"><Trash2 className="h-5 w-5"/> حذف حساب</CardTitle>
              <CardDescription>غیرقابل بازگشت. تمام داده‌ها حذف می‌شوند.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm opacity-80">قبل از حذف، از داده‌های خود خروجی بگیرید.</p>
            </CardContent>
            <CardFooter>
              <Button className="bg-rose-700 hover:bg-rose-700/90">درخواست حذف دائمی</Button>
            </CardFooter>
          </Card>
        </section>
      </main>
    </div>
  );
}
