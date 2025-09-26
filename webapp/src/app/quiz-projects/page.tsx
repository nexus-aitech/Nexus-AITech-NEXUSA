"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  AlertCircle,
  Timer,
  Loader2,
  ShieldCheck,
  EyeOff,
  ChevronRight,
  ChevronLeft,
  Flag,
  RefreshCcw,
  Sparkles,
  ClipboardList,
  Layers,
  Search,
  Filter,
  Bookmark,
  Upload,
  ExternalLink,
  Rocket,
  Trophy,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter } from "@/components/ui/drawer";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------
export type QuizQuestion = {
  id: string;
  type: "single" | "multiple" | "short"; // single choice, multi-choice, short answer
  title: string;
  description?: string;
  options?: { id: string; label: string }[]; // for choice-based
  required?: boolean;
  points?: number; // default 1
};

export type QuizPayload = {
  quiz_id: string;
  title: string;
  duration_sec: number; // total time
  questions: QuizQuestion[];
};

export type Project = {
  id: string;
  slug: string;
  title: string;
  description: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  est_hours: number;
  tags: string[];
  rubric?: string[]; // checklist items
};

// ------------------------------------------------------------
// Fallback seed (in case API is not ready at runtime)
// ------------------------------------------------------------
const FALLBACK_QUIZ: QuizPayload = {
  quiz_id: "crypto-basics",
  title: "کوییز مبانی کریپتو",
  duration_sec: 900, // 15m
  questions: [
    {
      id: "q1",
      type: "single",
      title: "مقدار کل عرضهٔ بیت‌کوین (BTC) چقدر است؟",
      options: [
        { id: "a", label: "۲۱ میلیون" },
        { id: "b", label: "نامحدود" },
        { id: "c", label: "۲۱۰ میلیون" },
      ],
      required: true,
      points: 1,
    },
    {
      id: "q2",
      type: "short",
      title: "نام اولین بلاک بیت‌کوین چیست؟",
      description: "یک واژه/عبارت کوتاه بنویسید.",
      required: true,
      points: 1,
    },
    {
      id: "q3",
      type: "single",
      title: "کدام مورد بهترین توصیف برای کلید خصوصی است؟",
      options: [
        { id: "a", label: "شناسهٔ عمومی کیف پول" },
        { id: "b", label: "رمز امنیتی که دسترسی به وجوه را می‌دهد" },
        { id: "c", label: "هش تراکنش" },
      ],
      required: true,
      points: 1,
    },
  ],
};

const FALLBACK_PROJECTS: Project[] = [
  {
    id: "p1",
    slug: "token-valuation",
    title: "ارزش‌گذاری توکن با مدل جریان نقدی",
    description:
      "با داده‌های آن‌چین و پارامترهای اقتصادی، ارزش منصفانهٔ یک توکن را با مدل‌سازی جریان‌های آتی تخمین بزنید.",
    level: "Advanced",
    est_hours: 8,
    tags: ["valuation", "on-chain", "modeling"],
    rubric: [
      "تعریف فرضیات و سناریوها",
      "ساخت مدل درآمدی/کارمزدی",
      "حساسیت‌سنجی (Sensitivity)",
      "گزارش PDF + Notebook",
    ],
  },
  {
    id: "p2",
    slug: "macro-liquidity-dashboard",
    title: "داشبورد نقدینگی کلان و هم‌بستگی با BTC",
    description:
      "یک داشبورد تعاملی بسازید که اثر DXY، نرخ بهره و شاخص‌های نقدینگی را بر بازده BTC نشان دهد.",
    level: "Intermediate",
    est_hours: 6,
    tags: ["macro", "dashboard", "analytics"],
    rubric: ["جمع‌آوری دادهٔ به‌روز", "نمودارهای تعاملی", "تحلیل هم‌بستگی", "جمع‌بندی و توصیه"]
  },
  {
    id: "p3",
    slug: "nft-price-index",
    title: "شاخص قیمت NFT برای یک سبد انتخابی",
    description:
      "با وزن‌دهی بازار و فیلتر لیکوئیدیتی، یک شاخص قیمت برای چند کالکشن منتخب بسازید.",
    level: "Beginner",
    est_hours: 4,
    tags: ["nft", "index", "timeseries"],
    rubric: ["انتخاب سبد", "تمیزکاری داده", "وزن‌دهی و محاسبه شاخص", "ویژوال نهایی"]
  },
];

// ------------------------------------------------------------
// Storage helpers
// ------------------------------------------------------------
const QS_KEY = (id: string) => `nexusa:quiz:${id}:answers`;
const PJ_KEY = (id: string) => `nexusa:project:${id}:state`;

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function saveJSON<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

// ------------------------------------------------------------
// Quiz Engine (enhanced)
// ------------------------------------------------------------
function QuizEngine() {
  const params = useSearchParams();
  const router = useRouter();
  const quizId = params.get("id") || FALLBACK_QUIZ.quiz_id; // allow /quiz-projects?id=...
  const userId = params.get("u") || "anonymous"; // replace with real auth

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<QuizPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remaining, setRemaining] = useState<number>(0);
  const [submitted, setSubmitted] = useState<null | { score: number; max: number; review?: any }>(null);
  const [focusLostCount, setFocusLostCount] = useState(0);
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [showNavigator, setShowNavigator] = useState(true);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch quiz definition
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await api<QuizPayload>(`/assessment/quiz?quiz_id=${quizId}`, { method: "GET" });
        if (!cancelled && res) {
          setQuiz(res);
          setRemaining(res.duration_sec);
          const saved = loadJSON<Record<string, any>>(QS_KEY(quizId), {});
          if (saved) setAnswers(saved);
        }
      } catch (e) {
        setQuiz(FALLBACK_QUIZ);
        setRemaining(FALLBACK_QUIZ.duration_sec);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  // Autosave answers
  useEffect(() => {
    if (!quiz) return;
    saveJSON(QS_KEY(quizId), answers);
  }, [answers, quiz, quizId]);

  // Timer
  useEffect(() => {
    if (!quiz || submitted) return;
    timerRef.current && clearInterval(timerRef.current as any);
    timerRef.current = setInterval(() => {
      setRemaining((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current as any);
          submitQuiz(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => timerRef.current && clearInterval(timerRef.current as any);
  }, [quiz, submitted]);

  // Anti-cheat: detect tab blur
  useEffect(() => {
    const onBlur = () => setFocusLostCount((c) => c + 1);
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, []);

  const totalQuestions = quiz?.questions.length || 0;
  const currentQ = quiz?.questions[currentIndex];

  const progress = useMemo(() => {
    const answered = Object.keys(answers).filter((k) => answers[k] !== undefined && answers[k] !== "").length;
    return totalQuestions ? Math.round((answered / totalQuestions) * 100) : 0;
  }, [answers, totalQuestions]);

  const remainingClock = useMemo(() => {
    const m = Math.floor(remaining / 60).toString().padStart(2, "0");
    const s = Math.floor(remaining % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }, [remaining]);

  const setAnswer = useCallback((qid: string, value: any) => setAnswers((prev) => ({ ...prev, [qid]: value })), []);
  const toggleFlag = (qid: string) => setFlagged((f) => ({ ...f, [qid]: !f[qid] }));

  async function submitQuiz(auto = false) {
    if (!quiz) return;
    try {
      setLoading(true);
      setError(null);
      const body = {
        user_id: userId,
        quiz_id: quiz.quiz_id,
        answers,
        duration_used_sec: quiz.duration_sec - remaining,
        focus_lost: focusLostCount,
        auto_submit: auto,
      };
      const res = await api<{ score: number; max: number; review?: any }>("/assessment/score", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setSubmitted(res);
      localStorage.removeItem(QS_KEY(quizId));
    } catch (e: any) {
      setError(e?.message || "اشکالی رخ داد. دوباره امتحان کنید.");
    } finally {
      setLoading(false);
    }
  }

  function nextQ() {
    setCurrentIndex((i) => Math.min(i + 1, (quiz?.questions.length || 1) - 1));
  }
  function prevQ() {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }
  function goQ(i: number) {
    setCurrentIndex(Math.max(0, Math.min(i, (quiz?.questions.length || 1) - 1)));
  }

  function resetQuiz() {
    setAnswers({});
    setCurrentIndex(0);
    setSubmitted(null);
    setRemaining(quiz?.duration_sec || 0);
    setFocusLostCount(0);
    localStorage.removeItem(QS_KEY(quizId));
  }

  if (loading && !quiz) {
    return (
      <div dir="rtl" className="min-h-[60vh] grid place-items-center">
        <div className="flex items-center gap-2 text-white/80"><Loader2 className="h-5 w-5 animate-spin"/> درحال بارگذاری...</div>
      </div>
    );
  }
  if (error && !quiz) {
    return (
      <div dir="rtl" className="min-h-[60vh] grid place-items-center">
        <div className="flex items-center gap-2 text-red-400"><AlertCircle className="h-5 w-5"/> {error}</div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* Navigator / Meta */}
      <div className="space-y-4 sticky top-4 self-start">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between"><span className="text-white">{quiz?.title}</span><Badge variant="secondary">آزمون</Badge></CardTitle>
            <CardDescription className="text-white/70">تمرکز خود را حفظ کنید؛ خروج از تب شمارش می‌شود.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2 text-white"><Timer className="h-5 w-5"/> زمان باقی‌مانده</div>
              <div className="font-mono text-lg" aria-live="polite">{remainingClock}</div>
            </div>
            <div>
              <div className="text-white mb-2">پیشرفت</div>
              <Progress value={progress} />
              <div className="mt-1 text-xs text-white/60">{progress}% تکمیل</div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2 text-white"><ShieldCheck className="h-5 w-5"/> ضدتقلب ساده</div>
              <div className="text-xs text-white/70 flex items-center gap-1"><EyeOff className="h-4 w-4"/> {focusLostCount} خروج</div>
            </div>
            {/* Grid navigator */}
            <div>
              <div className="text-xs text-white/80 mb-2">ناوبری سریع</div>
              <div className="grid grid-cols-8 gap-2">
                {quiz?.questions.map((q, i) => {
                  const answered = answers[q.id] !== undefined && answers[q.id] !== "" && !(Array.isArray(answers[q.id]) && (answers[q.id] as any[]).length === 0);
                  const isCurrent = i === currentIndex;
                  const isFlagged = !!flagged[q.id];
                  return (
                    <button
                      key={q.id}
                      onClick={() => goQ(i)}
                      className={cn(
                        "relative h-8 rounded-md border text-xs font-medium transition",
                        isCurrent ? "border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-200" : answered ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/5 text-white/70 hover:border-white/20"
                      )}
                      aria-label={`رفتن به سوال ${i + 1}`}
                    >
                      {i + 1}
                      {isFlagged && <span className="absolute -right-1 -top-1 inline-flex h-3 w-3 items-center justify-center rounded-full bg-amber-400" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Question Panel */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="text-white text-lg">سؤال {currentIndex + 1} از {totalQuestions}</span>
            <div className="flex items-center gap-2">
              <Badge variant={flagged[currentQ?.id || ""] ? "default" : "secondary"} className="cursor-pointer" onClick={() => currentQ && toggleFlag(currentQ.id)}>
                <Flag className="h-3.5 w-3.5 mr-1"/> پرچم‌گذاری
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentQ?.id}
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div className="text-white font-medium">{currentQ?.title}</div>
              {currentQ?.description && (
                <p className="text-white/70 text-sm">{currentQ.description}</p>
              )}

              {/* Render by type */}
              {currentQ?.type === "single" && (
                <RadioGroup
                  value={answers[currentQ.id] || ""}
                  onValueChange={(v) => setAnswer(currentQ.id, v)}
                  className="space-y-3"
                >
                  {currentQ.options?.map((op) => (
                    <div key={op.id} className="flex items-center space-x-2 space-x-reverse rounded-lg border p-3">
                      <RadioGroupItem id={`${currentQ.id}-${op.id}`} value={op.id} />
                      <Label htmlFor={`${currentQ.id}-${op.id}`} className="cursor-pointer">{op.label}</Label>
                    </div>
                  ))}
                </RadioGroup>
              )}

              {currentQ?.type === "multiple" && (
                <div className="space-y-2">
                  {currentQ.options?.map((op) => {
                    const arr: string[] = Array.isArray(answers[currentQ.id]) ? answers[currentQ.id] : [];
                    const checked = arr.includes(op.id);
                    return (
                      <label key={op.id} className="flex items-center gap-2 rounded-lg border p-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = new Set(arr);
                            if (e.target.checked) next.add(op.id); else next.delete(op.id);
                            setAnswer(currentQ.id, Array.from(next));
                          }}
                        />
                        <span>{op.label}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {currentQ?.type === "short" && (
                <div className="space-y-2">
                  <Input
                    placeholder="پاسخ کوتاه شما..."
                    value={answers[currentQ.id] || ""}
                    onChange={(e) => setAnswer(currentQ.id, e.target.value)}
                  />
                </div>
              )}

              <div className="flex justify-between pt-2">
                <Button variant="secondary" onClick={prevQ} disabled={currentIndex === 0}><ChevronRight className="h-4 w-4 ml-1"/> قبلی</Button>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={resetQuiz}><RefreshCcw className="h-4 w-4 mr-1"/> ریست</Button>
                  {currentIndex < (totalQuestions - 1) ? (
                    <Button onClick={nextQ}>بعدی <ChevronLeft className="h-4 w-4 mr-1"/></Button>
                  ) : (
                    <Button onClick={() => submitQuiz(false)} disabled={loading}>
                      {loading ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin"/>در حال ارسال</>) : (<>ثبت نهایی <CheckCircle2 className="h-4 w-4 mr-1"/></>)}
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Result */}
          <AnimatePresence>
            {submitted && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-8"
              >
                <Separator className="my-6" />
                <div className="grid gap-4 md:grid-cols-3">
                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-white">نتیجه آزمون</CardTitle>
                      <CardDescription className="text-white/70">امتیاز و خلاصه عملکرد</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-white/80">
                      <div className="flex items-center gap-2 text-lg">
                        <Trophy className="h-5 w-5"/> امتیاز شما: {submitted.score} از {submitted.max}
                      </div>
                      <div className="text-sm">زمان مصرف‌شده: {Math.min((quiz?.duration_sec || 0) - remaining, quiz?.duration_sec || 0)} ثانیه</div>
                      <div className="text-sm">خروج از تب: {focusLostCount} بار</div>
                      <div className="pt-2 flex gap-2">
                        <Button onClick={() => router.push("/reports")}>مشاهده گزارش‌ها</Button>
                        <Button variant="secondary" onClick={resetQuiz}>آزمون مجدد</Button>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-white">گواهی</CardTitle>
                      <CardDescription className="text-white/70">در صورت بالای ۸۰٪</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {submitted.score / submitted.max >= 0.8 ? (
                        <Button className="w-full"><Sparkles className="h-4 w-4 mr-2"/> دریافت Badge</Button>
                      ) : (
                        <div className="text-sm text-white/70">برای دریافت نشان، امتیاز بالاتری کسب کنید.</div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------
// Projects Hub (search, filters, submit drawer)
// ------------------------------------------------------------
function ProjectsHub() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  const [q, setQ] = useState("");
  const [levels, setLevels] = useState<Set<Project["level"]>>(new Set(["Beginner", "Intermediate", "Advanced"]));
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [onlySaved, setOnlySaved] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeProject, setActiveProject] = useState<Project | null>(null);

  // Submission state
  const [submissionUrl, setSubmissionUrl] = useState("");
  const [submissionNotes, setSubmissionNotes] = useState("");
  const [rubricChecks, setRubricChecks] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  // Load projects
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        // Try API first
        const res = await api<Project[]>("/projects/list", { method: "GET" });
        if (!cancelled && Array.isArray(res) && res.length) {
          setProjects(res);
        } else {
          setProjects(FALLBACK_PROJECTS);
        }
      } catch (e) {
        setProjects(FALLBACK_PROJECTS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Build tag cloud
  const allTags = useMemo(() => {
    const s = new Set<string>();
    projects.forEach((p) => p.tags.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [projects]);

  // Saved/bookmarked + done state
  const saved = useMemo(() => new Set<string>(loadJSON<string[]>("nexusa:projects:saved", [])), []);
  const doneMap = useMemo(() => new Set<string>(loadJSON<string[]>("nexusa:projects:done", [])), []);

  function toggleSave(id: string) {
    const arr = new Set<string>(loadJSON<string[]>("nexusa:projects:saved", []));
    arr.has(id) ? arr.delete(id) : arr.add(id);
    saveJSON("nexusa:projects:saved", Array.from(arr));
  }
  function toggleDone(id: string) {
    const arr = new Set<string>(loadJSON<string[]>("nexusa:projects:done", []));
    arr.has(id) ? arr.delete(id) : arr.add(id);
    saveJSON("nexusa:projects:done", Array.from(arr));
  }

  const filtered = useMemo(() => {
    const qn = q.trim().toLowerCase();
    return projects
      .filter((p) => levels.has(p.level))
      .filter((p) => (onlySaved ? saved.has(p.id) : true))
      .filter((p) => (tags.size ? p.tags.some((t) => tags.has(t)) : true))
      .filter((p) => (qn ? p.title.toLowerCase().includes(qn) || p.description.toLowerCase().includes(qn) : true));
  }, [projects, q, levels, tags, onlySaved, saved]);

  function openSubmit(p: Project) {
    setActiveProject(p);
    const prev = loadJSON<{ url?: string; notes?: string; rubric?: Record<string, boolean> }>(PJ_KEY(p.id), {});
    setSubmissionUrl(prev.url || "");
    setSubmissionNotes(prev.notes || "");
    setRubricChecks(prev.rubric || Object.fromEntries((p.rubric || []).map((r) => [r, false])));
    setDrawerOpen(true);
  }

  function persistProjectState() {
    if (!activeProject) return;
    saveJSON(PJ_KEY(activeProject.id), { url: submissionUrl, notes: submissionNotes, rubric: rubricChecks });
  }

  async function submitProject() {
    if (!activeProject) return;
    try {
      setSubmitting(true);
      persistProjectState();
      const payload = { project_id: activeProject.id, url: submissionUrl, notes: submissionNotes, rubric: rubricChecks };
      await api("/projects/submit", { method: "POST", body: JSON.stringify(payload) });
      toggleDone(activeProject.id);
      setDrawerOpen(false);
    } catch (e) {
      // noop – surface via toast in real app
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div dir="rtl" className="min-h-[40vh] grid place-items-center">
        <div className="flex items-center gap-2 text-white/80"><Loader2 className="h-5 w-5 animate-spin"/> درحال بارگذاری پروژه‌ها...</div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجو در عنوان/توضیح..."
            className="w-full rounded-2xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-400/60"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300/80"><Filter className="h-3.5 w-3.5" /> سطح:</span>
          {["Beginner", "Intermediate", "Advanced"].map((l) => (
            <button
              key={l}
              onClick={() => setLevels((prev) => { const n = new Set(prev); n.has(l as any) ? n.delete(l as any) : n.add(l as any); return n.size ? n : prev; })}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition",
                levels.has(l as any) ? "border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-200" : "border-white/10 bg-white/5 text-slate-300/80 hover:border-white/20"
              )}
            >
              {l}
            </button>
          ))}

          <span className="ml-2 text-xs text-white/70">تگ‌ها:</span>
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setTags((prev) => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; })}
              className={cn("rounded-full border px-3 py-1 text-xs transition", tags.has(t) ? "border-indigo-500/40 bg-indigo-500/15 text-indigo-200" : "border-white/10 bg-white/5 text-slate-300/80 hover:border-white/20")}
            >
              #{t}
            </button>
          ))}

          <button
            onClick={() => setOnlySaved((v) => !v)}
            className={cn("ml-1 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition", onlySaved ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200" : "border-white/10 bg-white/5 text-slate-300/80 hover:border-white/20")}
          >
            <Bookmark className="h-3.5 w-3.5" /> فقط ذخیره‌شده‌ها
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => {
          const isSaved = new Set(loadJSON<string[]>("nexusa:projects:saved", [])).has(p.id);
          const isDone = new Set(loadJSON<string[]>("nexusa:projects:done", [])).has(p.id);
          return (
            <Card key={p.id} className="group overflow-hidden border-white/10 bg-gradient-to-b from-slate-900/60 to-slate-950/80">
              <CardHeader>
                <CardTitle className="text-white text-base line-clamp-2">{p.title}</CardTitle>
                <CardDescription className="text-white/70 line-clamp-2">{p.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300/80">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1"><Layers className="h-3.5 w-3.5" />{p.level}</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">⏱ {p.est_hours}h</span>
                  {p.tags.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">#{t}</span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => openSubmit(p)}><Rocket className="h-4 w-4 mr-2"/> Start / Submit</Button>
                  <Button variant={isSaved ? "default" : "secondary"} onClick={() => toggleSave(p.id)} className="shrink-0">
                    <Bookmark className="h-4 w-4" />
                  </Button>
                  <Button variant={isDone ? "default" : "secondary"} onClick={() => toggleDone(p.id)} className="shrink-0">
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Drawer: Submit */}
      <Drawer open={drawerOpen} onOpenChange={(o) => { if (!o) persistProjectState(); setDrawerOpen(o); }}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="text-white flex items-center gap-2"><ClipboardList className="h-5 w-5"/> ارسال پروژه</DrawerTitle>
            <DrawerDescription className="text-white/70">آدرس دموی آنلاین یا ریپو + نکات و چک‌لیست را بفرستید.</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-white">لینک</Label>
              <Input placeholder="https://github.com/... یا https://app.demo..." value={submissionUrl} onChange={(e) => setSubmissionUrl(e.target.value)} />
              <p className="text-xs text-white/60">لینک باید قابل دسترسی عمومی باشد.</p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label className="text-white">توضیحات/نکات</Label>
              <Textarea rows={4} placeholder="آنچه ساخته‌اید، فرضیات و نقاط قوت/ضعف" value={submissionNotes} onChange={(e) => setSubmissionNotes(e.target.value)} />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label className="text-white">چک‌لیست ارزیابی</Label>
              <div className="grid sm:grid-cols-2 gap-2">
                {(activeProject?.rubric || []).map((r) => (
                  <label key={r} className="flex items-center gap-2 rounded-lg border p-3">
                    <input type="checkbox" checked={!!rubricChecks[r]} onChange={(e) => setRubricChecks((m) => ({ ...m, [r]: e.target.checked }))} />
                    <span className="text-white/90 text-sm">{r}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DrawerFooter>
            <div className="px-4 pb-2 flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => setDrawerOpen(false)}>بستن</Button>
              <Button disabled={submitting || !submissionUrl} onClick={submitProject}>
                {submitting ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin"/>در حال ارسال</>) : (<><Upload className="h-4 w-4 mr-2"/> ارسال</>)}
              </Button>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

// ------------------------------------------------------------
// Page: /quiz-projects (Tabs: Quiz | Projects)
// ------------------------------------------------------------
export default function QuizProjectsPage() {
  return (
    <div dir="rtl" className="relative min-h-screen w-full bg-[#070712] text-slate-100">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(124,58,237,0.18),rgba(2,6,23,0))]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:24px_24px]" />
      </div>

      <main className="relative mx-auto max-w-7xl px-4 pb-16 pt-10">
        <header className="mb-6">
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-2xl font-bold tracking-tight text-slate-100 md:text-3xl"
          >
            Quiz & Projects
          </motion.h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-300/80">
            آزمون‌های تعاملی با ضدتقلب ساده + پروژه‌های عملی با ارسال آنلاین و چک‌لیست ارزیابی. طراحی **Dark Futuristic** و آماده اجرا در Production.
          </p>
        </header>

        <Tabs defaultValue="quiz" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="quiz" className="data-[state=active]:bg-fuchsia-500/20 data-[state=active]:text-fuchsia-200">آزمون</TabsTrigger>
            <TabsTrigger value="projects" className="data-[state=active]:bg-indigo-500/20 data-[state=active]:text-indigo-200">پروژه‌های عملی</TabsTrigger>
          </TabsList>
          <TabsContent value="quiz" className="mt-6">
            <QuizEngine />
          </TabsContent>
          <TabsContent value="projects" className="mt-6">
            <ProjectsHub />
          </TabsContent>
        </Tabs>

        <footer className="mt-10 text-center text-xs text-slate-400/80">
          API endpoints مورد انتظار: <code className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">/assessment/quiz</code>, <code className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">/assessment/score</code>, <code className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">/projects/list</code>, <code className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">/projects/submit</code>
        </footer>
      </main>
    </div>
  );
}
