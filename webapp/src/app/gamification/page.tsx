"use client";

// =====================================================================
// NEXUSA — Gamification (Pro)
// • XP Progress (Leveling)
// • Badges (unlock animation)
// • Weekly Quests / Challenges
// • Leaderboard (Top 100) with filters
// • Lottie/SVG animations and in‑app notifications
// • API‑ready hooks (replace mocks with real endpoints)
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Badge as UIBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy, Medal, Target, Sparkles, Crown, Bell, ShieldCheck, RefreshCcw } from "lucide-react";

// Lottie (only on client)
const Lottie = dynamic(() => import("lottie-react"), { ssr: false });
// Minimal confetti anim (replace with your own JSON assets)
const confettiAnim = {
  v: "5.7.1", fr: 30, ip: 0, op: 60, w: 200, h: 200, nm: "confetti", ddd: 0, assets: [],
  layers: [
    { ddd: 0, ind: 1, ty: 4, nm: "shape", sr: 1, ks: { o:{a:0,k:100}, r:{a:0,k:0}, p:{a:0,k:[100,100,0]}, a:{a:0,k:[0,0,0]}, s:{a:0,k:[100,100,100]}},
      shapes:[{ ty: "sr", d:1, p:{a:0,k:[0,0]}, r:{a:0,k:6}, pt:{a:0,k:5}, ir:{a:0,k:0}, is:{a:0,k:0}, or:{a:0,k:50}, os:{a:0,k:0}, nm:"star" },
              { ty:"fl", c:{a:0,k:[0.9,0.7,0.2,1]}, o:{a:0,k:100}, nm:"fill"}], ip:0, op:60 }
  ]
};

// ===== Mock API (replace with real endpoints)
async function apiGet<T>(path: string, fallback: T): Promise<T> {
  try { const r = await fetch(path, { cache: "no-store"}); if (r.ok) return (await r.json()) as T; } catch {}
  return fallback;
}
async function apiPost<T>(path: string, body: any, fallback: T): Promise<T> {
  try { const r = await fetch(path, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body)}); if (r.ok) return (await r.json()) as T; } catch {}
  return fallback;
}

// ===== Types
type BadgeItem = { id: string; name: string; desc: string; icon: "trophy"|"medal"|"target"|"shield"; unlocked: boolean; date?: string };

type Quest = { id: string; title: string; desc: string; rewardXP: number; due: string; status: "available"|"accepted"|"completed" };

type UserGamification = { level: number; xp: number; xpForNext: number; badges: BadgeItem[]; weekly: Quest[] };

type Leader = { rank: number; user: string; country?: string; level: number; xp: number; badges: number; wins: number };

// ===== Helper UI
const BadgeIcon = ({ type }: { type: BadgeItem["icon"] }) => {
  if (type === "trophy") return <Trophy className="h-5 w-5"/>;
  if (type === "medal") return <Medal className="h-5 w-5"/>;
  if (type === "target") return <Target className="h-5 w-5"/>;
  return <ShieldCheck className="h-5 w-5"/>;
};

export default function GamificationPage(){
  // === i18n dir (RTL by default for fa)
  const dir: "rtl"|"ltr" = "rtl";

  // === State
  const [profile, setProfile] = useState<UserGamification>({
    level: 7,
    xp: 3240,
    xpForNext: 4000,
    badges: [
      { id:"b1", name:"Backtest Novice", desc:"اجرای ۱۰ بک‌تست", icon:"medal", unlocked:true, date: new Date().toISOString().slice(0,10)},
      { id:"b2", name:"Signal Hunter", desc:"۱۰۰ سیگنال بررسی‌شده", icon:"target", unlocked:true, date: new Date().toISOString().slice(0,10)},
      { id:"b3", name:"Drawdown Tamer", desc:"مدیریت ریسک پیشرفته", icon:"shield", unlocked:false },
      { id:"b4", name:"Top 10 Leaderboard", desc:"ورود به ۱۰ نفر اول", icon:"trophy", unlocked:false },
    ],
    weekly: [
      { id:"q1", title:"۵ بک‌تست جدید اجرا کن", desc:"روی ۳ تایم‌فریم مختلف.", rewardXP: 120, due: "جمعه", status:"available" },
      { id:"q2", title:"۳ گزارش AI تولید کن", desc:"روزانه/هفتگی برای BTC/ETH.", rewardXP: 90, due: "شنبه", status:"accepted" },
      { id:"q3", title:"۲ برچسب انجمن", desc:"به ۲ سؤال پاسخ بده و رای بگیر.", rewardXP: 70, due: "یکشنبه", status:"completed" },
    ],
  });

  const xpPct = useMemo(()=> Math.min(100, Math.round((profile.xp / profile.xpForNext) * 100)), [profile]);
  const [toast, setToast] = useState<{show:boolean; title:string; body?:string}>({show:false, title:"", body:""});
  const notify = (title: string, body?: string)=> setToast({show:true, title, body});
  useEffect(()=>{ if (!toast.show) return; const t = setTimeout(()=> setToast({show:false,title:"",body:""}), 3600); return ()=> clearTimeout(t); },[toast]);

  // Quests actions
  const updateQuest = useCallback((id: string, status: Quest["status"])=>{
    setProfile(p=> ({...p, weekly: p.weekly.map(q=> q.id===id? {...q, status}: q)}));
    if (status==="completed"){ const reward = profile.weekly.find(q=>q.id===id)?.rewardXP || 0; setProfile(p=> ({...p, xp: p.xp + reward })); notify("Badge/XP Update", `+${reward} XP`); }
  },[profile.weekly]);

  // Leaderboard (mock data)
  const [leaders, setLeaders] = useState<Leader[]>(()=> Array.from({length:100}, (_,i)=> ({
    rank: i+1,
    user: i===0?"you": `user_${i.toString().padStart(3,"0")}`,
    country: ["SE","DE","AE","IR","US"][i%5],
    level: 5 + Math.floor(Math.random()*10),
    xp: 1500 + Math.floor(Math.random()*9000),
    badges: Math.floor(Math.random()*12),
    wins: Math.floor(Math.random()*60),
  })).sort((a,b)=> b.xp - a.xp));

  const [filter, setFilter] = useState<string>("global");
  const filteredLeaders = useMemo(()=> leaders.filter(l=> filter==="global" || l.country===filter.toUpperCase()), [leaders, filter]);

  return (
    <main dir={dir} className="min-h-screen bg-[radial-gradient(1200px_600px_at_80%_-10%,rgba(56,189,248,.12),rgba(0,0,0,0)),radial-gradient(1000px_500px_at_10%_110%,rgba(168,85,247,.12),rgba(0,0,0,0))] text-white">
      <div className="container-responsive py-10">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-6">
          <UIBadge variant="secondary" className="mb-2">Gamification</UIBadge>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight flex items-center gap-2">
            <Crown className="h-6 w-6"/> بازی‌وارسازی NEXUSA
          </h1>
          <p className="mt-2 text-white/70 max-w-2xl">XP، نشان‌ها، چالش‌های هفتگی و لیدربرد برای یادگیری و ترید بهتر—با انیمیشن و نوتیفیکیشن زنده.</p>
        </motion.div>

        {/* Notifications (inline toast) */}
        {toast.show && (
          <motion.div initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }} className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
            <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/15 backdrop-blur px-4 py-2 shadow">
              <div className="flex items-center gap-2"><Bell className="h-4 w-4"/><span className="font-medium">{toast.title}</span></div>
              {toast.body && <div className="text-xs text-white/80 mt-1">{toast.body}</div>}
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* XP + Level */}
          <Card className="glass lg:col-span-1">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5"/> سطح و امتیاز</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-4xl font-extrabold">Lv. {profile.level}</div>
                  <div className="text-sm text-white/70">XP: {profile.xp} / {profile.xpForNext}</div>
                </div>
                <div className="w-28 h-28 grid place-items-center rounded-full border border-white/10 bg-white/5">
                  {/* simple radial progress (inline) */}
                  <div className="relative w-24 h-24">
                    <svg viewBox="0 0 36 36" className="w-full h-full rotate-[-90deg]">
                      <path d="M18 2 a 16 16 0 1 1 0 32 a 16 16 0 1 1 0 -32" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="3"/>
                      <path d="M18 2 a 16 16 0 1 1 0 32 a 16 16 0 1 1 0 -32" fill="none" stroke="url(#g)" strokeDasharray={`${xpPct}, 100`} strokeWidth="3"/>
                      <defs>
                        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#22c55e"/>
                          <stop offset="100%" stopColor="#06b6d4"/>
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 grid place-items-center text-sm font-semibold">{xpPct}%</div>
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <Progress value={xpPct} />
              </div>
              <div className="mt-2 text-xs text-white/70">با انجام چالش‌ها و فعالیت‌ها XP بگیرید و به سطح بعد برسید.</div>
            </CardContent>
          </Card>

          {/* Badges */}
          <Card className="glass lg:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><Medal className="h-5 w-5"/> نشان‌ها</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {profile.badges.map(b => (
                  <motion.div key={b.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`rounded-xl border p-3 ${b.unlocked?"border-emerald-400/40 bg-emerald-500/10":"border-white/10 bg-white/5"}`}>
                    <div className="flex items-center gap-2">
                      <BadgeIcon type={b.icon}/>
                      <div className="font-medium truncate">{b.name}</div>
                    </div>
                    <div className="text-xs text-white/70 mt-1">{b.desc}</div>
                    <div className="text-[10px] text-white/50 mt-1">{b.unlocked? (b.date||"امروز") : "قابل دریافت"}</div>
                    {b.unlocked && (
                      <div className="mt-2"><Lottie animationData={confettiAnim as any} loop={false} style={{ width: 60, height: 60 }}/></div>
                    )}
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {/* Weekly Quests */}
          <Card className="glass lg:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><Target className="h-5 w-5"/> چالش‌های هفتگی</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {profile.weekly.map(q => (
                  <div key={q.id} className="rounded-xl border border-white/10 bg-white/5 p-3 flex items-center gap-3">
                    <div className="flex-1">
                      <div className="font-medium">{q.title}</div>
                      <div className="text-xs text-white/70">{q.desc}</div>
                      <div className="text-xs mt-1"><UIBadge variant="secondary">+{q.rewardXP} XP</UIBadge> <span className="text-white/60">— موعد: {q.due}</span></div>
                    </div>
                    <div className="flex items-center gap-2">
                      {q.status === "available" && <Button size="sm" onClick={()=> updateQuest(q.id, "accepted")}>پذیرفتن</Button>}
                      {q.status === "accepted" && <Button size="sm" onClick={()=> updateQuest(q.id, "completed")} className="bg-emerald-600 hover:bg-emerald-500">تکمیل</Button>}
                      {q.status === "completed" && <UIBadge className="bg-emerald-600">Completed</UIBadge>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Hint */}
          <Card className="glass">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5"/> قوانین و نکته‌ها</CardTitle></CardHeader>
            <CardContent className="text-sm text-white/80 space-y-2">
              <p>XP بر اساس فعالیت‌های واقعی شما (بک‌تست، گزارش، مشارکت انجمن) محاسبه می‌شود.</p>
              <p>نشان‌ها هنگام رسیدن به آستانه‌ها به‌صورت خودکار فعال می‌شوند و نوتیفیکیشن دریافت می‌کنید.</p>
              <p>لیدربرد هر ۲۴ ساعت بروزرسانی می‌شود. تقلب یا اسپم منجر به حذف امتیاز می‌شود.</p>
            </CardContent>
          </Card>
        </div>

        {/* Leaderboard */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold flex items-center gap-2"><Crown className="h-5 w-5"/> لیدربرد</h2>
            <div className="flex items-center gap-2">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="فیلتر"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global</SelectItem>
                  <SelectItem value="SE">Sweden</SelectItem>
                  <SelectItem value="DE">Germany</SelectItem>
                  <SelectItem value="AE">UAE</SelectItem>
                  <SelectItem value="IR">Iran</SelectItem>
                  <SelectItem value="US">USA</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="secondary" onClick={()=>{ /* TODO: fetch latest */ }}><RefreshCcw className="h-4 w-4 mr-1"/> بروزرسانی</Button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 overflow-hidden bg-white/[0.03]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>کاربر</TableHead>
                  <TableHead>کشور</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>XP</TableHead>
                  <TableHead>Badges</TableHead>
                  <TableHead>Wins</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeaders.slice(0,100).map(r => (
                  <TableRow key={r.rank} className={r.user==="you"?"bg-emerald-500/10":undefined}>
                    <TableCell>{r.rank}</TableCell>
                    <TableCell className="font-medium">{r.user}</TableCell>
                    <TableCell>{r.country || ""}</TableCell>
                    <TableCell>{r.level}</TableCell>
                    <TableCell>{r.xp.toLocaleString()}</TableCell>
                    <TableCell>{r.badges}</TableCell>
                    <TableCell>{r.wins}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <Separator className="my-10"/>

        {/* CTA */}
        <div className="text-center">
          <p className="text-white/70 text-sm">برای دریافت XP بیشتر، از <a className="underline" href="/backtesting">بک‌تست</a> و <a className="underline" href="/reports">گزارش‌های AI</a> استفاده کن.</p>
        </div>
      </div>
    </main>
  );
}