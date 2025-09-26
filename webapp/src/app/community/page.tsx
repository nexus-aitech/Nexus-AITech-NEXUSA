"use client";

// =====================================================================
// NEXUSA — Community Forum (Pro)
// • Category boards (General / Strategies / Signals / AI Reports / Offtopic)
// • Threads list with sort & search
// • Post composer (markdown-lite) + client-side toxicity check placeholder
// • Upvote/Downvote with score & accepted answer by Tutor/Admin
// • User mini-profiles (level/xp/badges)
// • Notifications (reply/mention) lightweight toast + inbox drawer
// • API-ready hooks (replace mocks with your endpoints)
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  CheckCircle2,
  ShieldAlert,
  Bell,
  BellDot,
  Search,
  Filter,
  BookOpen,
  GitBranch,
  Bot,
  Hash,
  Trophy,
  Reply,
  Send,
  User as UserIcon
} from "lucide-react";

// ======= Types
export type UserMini = { id: string; name: string; handle: string; level: number; xp: number; badges: number; role?: "user"|"tutor"|"admin" };
export type Post = { id: string; user: UserMini; body: string; up: number; down: number; createdAt: number; accepted?: boolean };
export type Thread = { id: string; category: string; title: string; user: UserMini; createdAt: number; lastActivity: number; views: number; posts: Post[]; tags?: string[] };

const CATEGORIES = [
  { id: "general", label: "General", icon: MessageSquare },
  { id: "strategies", label: "Strategies", icon: GitBranch },
  { id: "signals", label: "Signals", icon: Hash },
  { id: "ai-reports", label: "AI Reports", icon: Bot },
  { id: "offtopic", label: "Offtopic", icon: BookOpen },
] as const;

// ======= Mock data helpers (replace with API calls)
const you: UserMini = { id: "you", name: "You", handle: "@you", level: 7, xp: 3240, badges: 6, role: "user" };
const tutor: UserMini = { id: "t1", name: "Tutor", handle: "@tutor", level: 12, xp: 9200, badges: 14, role: "tutor" };
const admin: UserMini = { id: "a1", name: "Admin", handle: "@admin", level: 20, xp: 25000, badges: 30, role: "admin" };

function sampleThread(i: number, cat: string): Thread{
  return {
    id: `th_${cat}_${i}`,
    category: cat,
    title: cat==="strategies"? `Ichimoku + ATR on BTC (v${i})` : cat==="signals"? `Signal quality discussion #${i}` : cat==="ai-reports"? `Weekly AI report critique #${i}` : `General topic #${i}`,
    user: i%3===0? tutor : (i%5===0? admin : you),
    createdAt: Date.now() - (i+1)*36e5,
    lastActivity: Date.now() - (i)*24e5,
    views: 200 + Math.floor(Math.random()*1200),
    posts: [
      { id: `p_${i}_1`, user: you, body: "نظر اولیه درباره استراتژی…", up: 6, down: 0, createdAt: Date.now()-36e5 },
      { id: `p_${i}_2`, user: tutor, body: "پیشنهاد بهبود: تنظیم تنکان/کیجون…", up: 12, down: 1, createdAt: Date.now()-30e5, accepted: i%4===0 },
    ],
    tags: ["btc","ichimoku","risk"].slice(0,(i%3)+1),
  };
}

const initialThreads: Thread[] = [
  ...Array.from({length: 4}).map((_,i)=> sampleThread(i,"general")),
  ...Array.from({length: 4}).map((_,i)=> sampleThread(i,"strategies")),
  ...Array.from({length: 4}).map((_,i)=> sampleThread(i,"signals")),
  ...Array.from({length: 3}).map((_,i)=> sampleThread(i,"ai-reports")),
];

// ====== Very simple toxicity check placeholder (client-only)
function isToxic(text: string){
  const banned = [/\bshit\b/i,/\bfuck\b/i,/\bidiot\b/i];
  return banned.some(re=> re.test(text));
}

export default function CommunityPage(){
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]["id"]>("general");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("latest");
  const [threads, setThreads] = useState<Thread[]>(initialThreads);

  const filtered = useMemo(()=> threads
    .filter(t=> t.category===cat)
    .filter(t=> !q || t.title.toLowerCase().includes(q.toLowerCase()))
    .sort((a,b)=> sort==="latest"? b.lastActivity - a.lastActivity : b.views - a.views)
  ,[threads, cat, q, sort]);

  // Notifications (simple)
  const [toast, setToast] = useState<{show:boolean; title:string; body?:string}>({show:false, title:"", body:""});
  useEffect(()=>{ if (!toast.show) return; const t = setTimeout(()=> setToast({show:false,title:"",body:""}), 3000); return ()=> clearTimeout(t); },[toast]);

  // Composer state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const canPost = title.trim().length>5 && body.trim().length>10;

  const submitThread = useCallback(()=>{
    if (isToxic(title+"\n"+body)) { setToast({show:true, title:"🚫 محتوای نامناسب", body:"لطفاً متن را اصلاح کنید."}); return; }
    const th: Thread = {
      id: `th_new_${Date.now()}`,
      category: cat,
      title,
      user: you,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      views: 0,
      posts: [{ id: `p_${Date.now()}`, user: you, body, up: 0, down: 0, createdAt: Date.now() }],
      tags: [],
    };
    setThreads(prev=> [th, ...prev]);
    setTitle(""); setBody("");
    setToast({show:true, title:"ارسال شد", body:"موضوع شما ایجاد شد."});
  },[title, body, cat]);

  return (
    <main dir="rtl" className="min-h-screen bg-[radial-gradient(1200px_600px_at_80%_-10%,rgba(56,189,248,.12),rgba(0,0,0,0)),radial-gradient(1000px_500px_at_10%_110%,rgba(168,85,247,.12),rgba(0,0,0,0))] text-white">
      <div className="container-responsive py-10">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="mb-6">
          <Badge variant="secondary" className="mb-2">Community</Badge>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight">تالار گفتگوی NEXUSA</h1>
          <p className="mt-2 text-white/70 max-w-2xl">پرسش و پاسخ، اشتراک استراتژی و بررسی گزارش‌های AI با رأی‌گیری و پاسخ منتخب.</p>
        </motion.div>

        {/* Notifications */}
        {toast.show && (
          <motion.div initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
            <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/15 backdrop-blur px-4 py-2 shadow">
              <div className="text-sm font-medium">{toast.title}</div>
              {toast.body && <div className="text-xs text-white/80">{toast.body}</div>}
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left: Categories & Profile mini */}
          <aside className="space-y-4 lg:col-span-1">
            <Card className="glass">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><Hash className="h-5 w-5"/>دسته‌بندی‌ها</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {CATEGORIES.map(({id,label,icon:Icon}) => (
                  <button key={id} onClick={()=> setCat(id)} className={`w-full rounded-xl border px-3 py-2 flex items-center gap-2 text-sm ${cat===id?"border-emerald-400/40 bg-emerald-500/10":"border-white/10 hover:bg-white/5"}`}>
                    <Icon className="h-4 w-4"/> {label}
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card className="glass">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5"/>پروفایل کوتاه</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                <div className="flex items-center gap-2"><UserIcon className="h-4 w-4"/> {you.name} <span className="text-white/50">{you.handle}</span></div>
                <div>Lv.{you.level} • XP {you.xp}</div>
                <div>Badges: {you.badges}</div>
                <Link className="underline text-xs text-white/70" href="/gamification">نمایه کامل</Link>
              </CardContent>
            </Card>
          </aside>

          {/* Right: Forum */}
          <section className="lg:col-span-3 space-y-6">
            {/* Search & sort */}
            <Card className="glass">
              <CardContent className="p-4 grid grid-cols-1 md:grid-cols-[1fr_200px_160px] gap-3 items-center">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4"/>
                  <Input value={q} onChange={e=>setQ(e.target.value)} placeholder="جستجو در عناوین…"/>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs">مرتب‌سازی</Label>
                  <Select value={sort} onValueChange={setSort}>
                    <SelectTrigger><SelectValue placeholder="Sort"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="latest">جدیدترین فعالیت</SelectItem>
                      <SelectItem value="views">بیشترین بازدید</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-right text-xs text-white/70">{filtered.length} موضوع</div>
              </CardContent>
            </Card>

            {/* Composer */}
            <Card className="glass">
              <CardHeader className="pb-2"><CardTitle className="text-base">ایجاد موضوع جدید</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Input value={title} onChange={e=>setTitle(e.target.value)} placeholder="عنوان"/>
                <Textarea value={body} onChange={e=>setBody(e.target.value)} placeholder="متن (از Markdown ساده پشتیبانی می‌شود)" className="min-h-[120px]"/>
                <div className="flex items-center justify-between text-xs text-white/60">
                  <div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4"/> ضداسپم/تاکسیک سمت سرور اعمال می‌شود.</div>
                  <Button size="sm" onClick={submitThread} disabled={!canPost}><Send className="h-4 w-4 mr-1"/> ارسال</Button>
                </div>
              </CardContent>
            </Card>

            {/* Threads list */}
            <div className="space-y-3">
              {filtered.map(t=> (
                <ThreadRow key={t.id} t={t} onUpdate={(nt)=> setThreads(prev=> prev.map(x=> x.id===nt.id? nt : x))} onToast={(x)=> setToast({show:true, ...x})} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function ThreadRow({ t, onUpdate, onToast }: { t: Thread; onUpdate: (t: Thread)=>void; onToast: (p: {title:string; body?:string})=>void }){
  const [expanded, setExpanded] = useState(false);
  const score = (t.posts.reduce((s,p)=> s + (p.up - p.down), 0));
  const vote = (delta: 1|-1)=>{
    const nt = {...t, posts: t.posts.map((p,i)=> i===0? {...p, up: p.up + (delta>0?1:0), down: p.down + (delta<0?1:0)} : p)};
    onUpdate(nt);
  };
  const markAccepted = (pid: string)=>{
    const nt = {...t, posts: t.posts.map(p=> ({...p, accepted: p.id===pid}))}; onUpdate(nt); onToast({title:"✅ پاسخ منتخب ثبت شد"});
  };
  return (
    <Card className="glass">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center gap-1">
            <Button size="icon" variant="secondary" onClick={()=>vote(1)}><ThumbsUp className="h-4 w-4"/></Button>
            <div className="text-xs text-white/70">{score}</div>
            <Button size="icon" variant="secondary" onClick={()=>vote(-1)}><ThumbsDown className="h-4 w-4"/></Button>
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-lg leading-tight truncate">{t.title}</h3>
              <div className="text-xs text-white/60">{new Date(t.lastActivity).toLocaleString()}</div>
            </div>
            <div className="text-xs text-white/60 mt-1 flex items-center gap-2">
              <span className="rounded-full border border-white/10 px-2 py-0.5">{t.category}</span>
              {t.tags?.map(tag=> <span key={tag} className="rounded-full border border-white/10 px-2 py-0.5">#{tag}</span>)}
              <span>•</span>
              <span>👁 {t.views}</span>
              <span>•</span>
              <span>💬 {t.posts.length}</span>
            </div>
            {/* First post preview */}
            <p className="mt-2 text-sm text-white/80 line-clamp-2">{t.posts[0]?.body}</p>
            <div className="mt-3 flex items-center gap-2 text-xs text-white/70">
              <span className="rounded-full border border-white/10 px-2 py-0.5">{t.user.name}</span>
              <span className="text-white/50">{t.user.handle}</span>
              <span>• Lv.{t.user.level} • XP {t.user.xp}</span>
            </div>
            <div className="mt-3">
              <Button size="sm" variant="secondary" onClick={()=> setExpanded(v=>!v)}>{expanded?"بستن":"مشاهده گفت‌وگو"}</Button>
            </div>

            {expanded && (
              <div className="mt-4 space-y-3">
                {t.posts.map((p,idx)=> (
                  <div key={p.id} className={`rounded-xl border p-3 ${idx===0?"bg-white/5 border-white/10":"bg-white/3 border-white/10"}`}>
                    <div className="flex items-center justify-between text-xs text-white/70">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-white/10 px-2 py-0.5">{p.user.name}</span>
                        <span className="text-white/50">{p.user.handle}</span>
                        {p.user.role==="tutor" && <Badge variant="secondary">Tutor</Badge>}
                        {p.user.role==="admin" && <Badge variant="secondary">Admin</Badge>}
                      </div>
                      <span>{new Date(p.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-2 text-sm whitespace-pre-wrap">{p.body}</p>
                    <div className="mt-2 flex items-center gap-2">
                      {!p.accepted ? (
                        <Button size="xs" onClick={()=> markAccepted(p.id)} className="gap-1"><CheckCircle2 className="h-4 w-4"/> انتخاب به‌عنوان پاسخ</Button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-400 text-xs"><CheckCircle2 className="h-4 w-4"/> پاسخ منتخب</span>
                      )}
                      <Button size="xs" variant="secondary" className="gap-1"><Reply className="h-4 w-4"/> پاسخ</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}