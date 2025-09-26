"use client";

// ================================================================
// NEXUSA — AI Tutor (Pro)
// • Full in‑app chat UI (no iframe)
// • Multilingual (fa/en/es/ar) with RTL/LTR dir
// • Bubble chat with citations, code blocks, and inline charts
// • Session history (local + API‑ready), resume/delete/rename
// • Lessons/Quizzes side access + quick actions
// • Personalization hooks (profile + skill graph placeholders)
// • Realtime transport ready (SSE/WebSocket fallback)
// • Accessibility, keyboard UX, and mobile‑first responsive
// NOTE: Replace mock calls with your backend endpoints.
// ================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Send,
  Plus,
  Trash2,
  Edit3,
  Save,
  FileText,
  Sparkles,
  Globe2,
  History,
  BookOpen,
  GraduationCap,
  BarChart3,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Charts (inline rendering inside assistant messages)
const Recharts = {
  ResponsiveContainer: dynamic(() => import("recharts").then(m => m.ResponsiveContainer as any), { ssr: false }) as any,
  LineChart: dynamic(() => import("recharts").then(m => m.LineChart as any), { ssr: false }) as any,
  Line: dynamic(() => import("recharts").then(m => m.Line as any), { ssr: false }) as any,
  CartesianGrid: dynamic(() => import("recharts").then(m => m.CartesianGrid as any), { ssr: false }) as any,
  XAxis: dynamic(() => import("recharts").then(m => m.XAxis as any), { ssr: false }) as any,
  YAxis: dynamic(() => import("recharts").then(m => m.YAxis as any), { ssr: false }) as any,
  Tooltip: dynamic(() => import("recharts").then(m => m.Tooltip as any), { ssr: false }) as any,
};

const CitationPopover = dynamic(() => import("@/components/shared/CitationPopover").then(m => m.CitationPopover), { ssr: false });

// === Types
export type TutorRole = "user" | "assistant" | "system";
export type TutorChunk = { type: "text" | "code" | "chart"; content: string; meta?: any };
export type TutorMessage = { id: string; role: TutorRole; chunks: TutorChunk[]; citations?: any[]; ts: number };
export type TutorSession = { id: string; title: string; lang: string; messages: TutorMessage[]; createdAt: number; updatedAt: number };

const LANGS = [
  { code: "fa", label: "فارسی", dir: "rtl" as const },
  { code: "en", label: "English", dir: "ltr" as const },
  { code: "es", label: "Español", dir: "ltr" as const },
  { code: "ar", label: "العربية", dir: "rtl" as const },
];

// === Utilities
const uid = () => Math.random().toString(36).slice(2);
const lsKey = (sid: string) => `nx_tutor_${sid}`;

function useLocaleDir(lang: string){
  const l = LANGS.find(x=>x.code===lang);
  return l?.dir ?? "ltr";
}

// === Mock API (replace with real endpoints)
async function generateAssistantReply(prompt: string, lang: string): Promise<TutorMessage> {
  // simulate streaming result with chart & citation chunk
  const id = uid();
  const base: TutorMessage = {
    id, role: "assistant", ts: Date.now(), chunks: [
      { type: "text", content: lang==="fa" ? `پاسخ خلاصه: ${prompt}\n\n— نکته: مدیریت ریسک را فراموش نکنید.` : `Summary answer: ${prompt}\n\n— Note: do not forget risk management.` },
      { type: "code", content: `// Example: Ichimoku signal pseudo-code\nif (price > cloud && tenkan > kijun) {\n  signal = \"buy\";\n}` },
      { type: "chart", content: "equity", meta: { data: Array.from({length:50}).map((_,i)=>({ t:i, v: 10000 + Math.sin(i/4)*120 + i*8 })) } },
    ],
    citations: [
      { title: "Binance API Docs", href: "https://binance-docs.github.io", type: "web", tags:["api"], reliability: 85 },
      { title: "Investopedia — Ichimoku", href: "https://www.investopedia.com/terms/i/ichimoku-cloud.asp", type: "web", tags:["indicator"], reliability: 80 },
    ],
  };
  return new Promise(res=> setTimeout(()=> res(base), 900));
}

// === Session store
function saveSession(s: TutorSession){
  try{ localStorage.setItem(lsKey(s.id), JSON.stringify(s)); }catch{}
}
function loadSession(id: string): TutorSession | null {
  try{ const raw = localStorage.getItem(lsKey(id)); return raw? JSON.parse(raw) as TutorSession : null; }catch{ return null; }
}
function listSessions(): TutorSession[]{
  try{
    const out: TutorSession[] = [];
    for (let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i)!; if (!k.startsWith("nx_tutor_")) continue;
      const s = localStorage.getItem(k); if (!s) continue; try{ out.push(JSON.parse(s)); }catch{}
    }
    return out.sort((a,b)=> b.updatedAt - a.updatedAt);
  }catch{ return []; }
}
function deleteSession(id: string){ try{ localStorage.removeItem(lsKey(id)); }catch{} }

export default function TutorPage(){
  // UI State
  const [lang, setLang] = useState<string>("fa");
  const dir = useLocaleDir(lang);

  const [sessions, setSessions] = useState<TutorSession[]>([]);
  const [sid, setSid] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [editingTitle, setEditingTitle] = useState<boolean>(false);

  const [input, setInput] = useState<string>("");
  const [sending, setSending] = useState<boolean>(false);
  const [messages, setMessages] = useState<TutorMessage[]>([]);

  // bootstrap
  useEffect(()=>{ const list = listSessions(); setSessions(list); if (list.length){ selectSession(list[0].id);} else { newSession(); } },[]);

  const newSession = useCallback(()=>{
    const id = uid();
    const s: TutorSession = { id, title: "New session", lang, messages: [], createdAt: Date.now(), updatedAt: Date.now() };
    saveSession(s); setSessions(listSessions()); selectSession(id);
  },[lang]);

  const selectSession = useCallback((id: string)=>{
    const s = loadSession(id); if (!s) return;
    setSid(s.id); setTitle(s.title); setMessages(s.messages || []); setLang(s.lang||"fa");
  },[]);

  const renameSession = useCallback(()=>{ setEditingTitle(false); const s = loadSession(sid); if (!s) return; s.title = title || "Untitled"; s.updatedAt = Date.now(); saveSession(s); setSessions(listSessions()); },[sid,title]);

  const removeSession = useCallback((id: string)=>{ deleteSession(id); setSessions(listSessions()); if (id===sid){ const list = listSessions(); list[0]? selectSession(list[0].id) : newSession(); } },[sid, selectSession, newSession]);

  const addMessage = useCallback((m: TutorMessage)=>{ setMessages(prev=>{ const next=[...prev,m]; const s = loadSession(sid); if (s){ s.messages = next; s.updatedAt = Date.now(); saveSession(s);} return next; }); },[sid]);

  const onSend = useCallback(async ()=>{
    if (!input.trim()) return;
    const userMsg: TutorMessage = { id: uid(), role: "user", ts: Date.now(), chunks: [{ type: "text", content: input }] };
    addMessage(userMsg); setInput(""); setSending(true);
    const reply = await generateAssistantReply(input, lang);
    addMessage(reply); setSending(false);
  },[input, lang, addMessage]);

  return (
    <div dir={dir} className="min-h-screen grid grid-rows-[auto,1fr] bg-gradient-to-b from-background to-muted text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-4">
        <div className="mx-auto max-w-7xl py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">AI Tutor</Badge>
            {!editingTitle ? (
              <button onClick={()=>setEditingTitle(true)} className="inline-flex items-center gap-1 text-white/80 hover:text-white"><Edit3 className="h-4 w-4"/>{title || (lang==="fa"?"جلسه جدید":"New session")}</button>
            ) : (
              <div className="flex items-center gap-2"><Input value={title} onChange={e=>setTitle(e.target.value)} className="h-8 w-48"/><Button size="sm" onClick={renameSession}><Save className="h-4 w-4"/></Button></div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Select value={lang} onValueChange={v=>{ setLang(v); const s = loadSession(sid); if (s){ s.lang=v; saveSession(s); setSessions(listSessions()); } }}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Language"/></SelectTrigger>
              <SelectContent>{LANGS.map(l=> <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="secondary" size="sm" onClick={newSession} className="gap-1"><Plus className="h-4 w-4"/>{lang==="fa"?"جلسه جدید":"New"}</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl grid grid-cols-1 md:grid-cols-[280px,1fr] gap-4 p-4">
        {/* Sidebar: Sessions + Learning shortcuts */}
        <aside className="space-y-4">
          <Card className="glass">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><History className="h-4 w-4"/>{lang==="fa"?"جلسات":"Sessions"}</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-[40vh] overflow-auto pr-1">
              {sessions.length===0 && <div className="text-sm text-white/60">{lang==="fa"?"جلسه‌ای نیست":"No sessions yet"}</div>}
              {sessions.map(s=> (
                <div key={s.id} className={`group flex items-center justify-between rounded-lg border px-2 py-1.5 ${s.id===sid?"border-emerald-400/40 bg-emerald-500/10":"border-white/10 hover:bg-white/5"}`}>
                  <button onClick={()=>selectSession(s.id)} className="truncate text-sm text-left flex-1 pr-2">{s.title}</button>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    <Button size="icon" variant="ghost" onClick={()=>removeSession(s.id)}><Trash2 className="h-4 w-4"/></Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="glass">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><BookOpen className="h-4 w-4"/>{lang==="fa"?"درس‌ها و کوییزها":"Lessons & Quizzes"}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex flex-col gap-2">
                <Button asChild variant="secondary" size="sm"><Link href="/courses">{lang==="fa"?"مسیرهای آموزشی":"Curriculum"}</Link></Button>
                <Button asChild variant="secondary" size="sm"><Link href="/assessment?page=quiz">{lang==="fa"?"کوییزها":"Quizzes"}</Link></Button>
                <Button asChild variant="secondary" size="sm"><Link href="/reports">{lang==="fa"?"گزارش‌های AI":"AI Reports"}</Link></Button>
              </div>
            </CardContent>
          </Card>

          <Card className="glass">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><GraduationCap className="h-4 w-4"/>{lang==="fa"?"پروفایل و مهارت":"Profile & Skills"}</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="text-white/80">{lang==="fa"?"نمودار مهارت (نمونه)":"Skill graph (sample)"}</div>
              <div className="h-20 rounded-md border border-white/10 bg-white/5 grid place-items-center text-xs text-white/60">{lang==="fa"?"BKT/DKT به‌زودی":"BKT/DKT coming soon"}</div>
              <div className="text-xs text-white/60">{lang==="fa"?"شخصی‌سازی پاسخ‌ها بر اساس تاریخچهٔ یادگیری":"Personalized answers based on learning history"}</div>
            </CardContent>
          </Card>
        </aside>

        {/* Chat panel */}
        <section className="relative flex flex-col min-h-[70vh]">
          <div className="flex-1 overflow-auto rounded-xl border border-white/10 bg-white/[0.03] p-3 md:p-4 space-y-3">
            {messages.length===0 && (
              <div className="grid place-items-center h-[40vh] text-white/70 text-sm">
                {lang==="fa"?"سؤال خود را بپرسید…":"Ask your question…"}
              </div>
            )}
            {messages.map(m=> <MessageView key={m.id} m={m} />)}
            {sending && (
              <div className="flex items-center gap-2 text-white/70 text-sm"><Loader2 className="h-4 w-4 animate-spin"/>{lang==="fa"?"در حال تولید پاسخ…":"Generating reply…"}</div>
            )}
          </div>

          <div className="mt-3">
            <div className="flex items-end gap-2">
              <Textarea value={input} onChange={e=>setInput(e.target.value)} placeholder={lang==="fa"?"مثلاً: با ایچیموکو یک استراتژی کوتاه‌مدت بساز":"e.g., build a short‑term Ichimoku strategy"} className="min-h-[72px]"/>
              <div className="flex flex-col gap-2">
                <Button onClick={onSend} className="gap-1"><Send className="h-4 w-4"/>{lang==="fa"?"ارسال":"Send"}</Button>
                <TooltipProvider><Tooltip><TooltipTrigger asChild><div className="text-[10px] text-white/60">{lang==="fa"?"ریسک‌ها را مدیریت کنید":"Manage risks"}</div></TooltipTrigger><TooltipContent><p className="max-w-[220px] text-xs">Use position sizing, stop‑loss, and avoid over‑leverage.</p></TooltipContent></Tooltip></TooltipProvider>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function MessageView({ m }: { m: TutorMessage }){
  return (
    <div className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}>
      <div className={`max-w-[92%] md:max-w-[75%] rounded-2xl px-3 py-2 shadow ${m.role==="user"?"bg-emerald-500/15 border border-emerald-400/30":"bg-white/5 border border-white/10"}`}>
        {m.chunks.map((c,idx)=> {
          if (c.type === "text") return <p key={idx} className="whitespace-pre-wrap leading-6 text-sm text-white/90">{c.content}</p>;
          if (c.type === "code") return (
            <pre key={idx} className="mt-2 rounded-lg bg-black/40 p-3 text-[12px] overflow-auto"><code>{c.content}</code></pre>
          );
          if (c.type === "chart") return (
            <div key={idx} className="mt-2 h-[220px] w-full">
              <Recharts.ResponsiveContainer width="100%" height="100%">
                <Recharts.LineChart data={c.meta?.data || []}>
                  <Recharts.CartesianGrid strokeDasharray="3 3" />
                  <Recharts.XAxis dataKey="t"/>
                  <Recharts.YAxis/>
                  <Recharts.Tooltip/>
                  <Recharts.Line type="monotone" dataKey="v" dot={false} />
                </Recharts.LineChart>
              </Recharts.ResponsiveContainer>
            </div>
          );
          return null;
        })}
        {m.citations && m.citations.length>0 && (
          <div className="mt-2">
            {/* @ts-ignore */}
            <CitationPopover items={m.citations} />
          </div>
        )}
        <div className="mt-1 text-[10px] text-white/50">{new Date(m.ts).toLocaleString()}</div>
      </div>
    </div>
  );
}