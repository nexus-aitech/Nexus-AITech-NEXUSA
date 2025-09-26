"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Clock, Loader2, RefreshCcw, ShieldCheck, Trophy, XCircle } from "lucide-react";

// Types
export type QuizOption = { id: string; label: string };
export type QuizQuestion = {
  id: string;
  type: "single" | "multi" | "text" | "number";
  title: string;
  hint?: string;
  options?: QuizOption[]; // for single/multi
  required?: boolean;
  points?: number;
};
export type QuizPayload = {
  id: string;
  title: string;
  durationSec?: number; // optional timer
  questions: QuizQuestion[];
};

const FALLBACK_QUIZ: QuizPayload = {
  id: "demo-101",
  title: "NEXUSA Onboarding Quiz",
  durationSec: 300,
  questions: [
    {
      id: "q1",
      type: "single",
      title: "What is the total capped supply of Bitcoin?",
      options: [
        { id: "a", label: "21 million" },
        { id: "b", label: "42 million" },
        { id: "c", label: "No fixed cap" },
      ],
      required: true,
      points: 10,
    },
    {
      id: "q2",
      type: "text",
      title: "What is the name of the first Bitcoin block?",
      hint: "Two words, starts with 'Genesis'",
      required: true,
      points: 10,
    },
    {
      id: "q3",
      type: "multi",
      title: "Select the exchanges supported by NEXUSA (as of today).",
      options: [
        { id: "binance", label: "Binance" },
        { id: "bybit", label: "Bybit" },
        { id: "okx", label: "OKX" },
        { id: "robinhood", label: "Robinhood" },
      ],
      required: true,
      points: 10,
    },
  ],
};

export default function AssessmentPage() {
  const qs = useSearchParams();
  const router = useRouter();

  const quizId = qs.get("id") || FALLBACK_QUIZ.id;
  const userId = qs.get("user") || "guest";

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [quiz, setQuiz] = useState<QuizPayload>(FALLBACK_QUIZ);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [result, setResult] = useState<{ score: number; max: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load quiz from API with safe fallback
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const r = await fetch(`/api/assessment/quiz?id=${encodeURIComponent(quizId)}`, { cache: "no-store" });
        if (r.ok) {
          const data = (await r.json()) as QuizPayload;
          if (mounted && data?.questions?.length) setQuiz(data);
        }
      } catch {}
      finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [quizId]);

  // Restore draft from localStorage
  useEffect(() => {
    try {
      const k = `nx_quiz_${quizId}_${userId}`;
      const raw = localStorage.getItem(k);
      if (raw) setAnswers(JSON.parse(raw));
    } catch {}
  }, [quizId, userId]);

  // Autosave draft
  useEffect(() => {
    try {
      const k = `nx_quiz_${quizId}_${userId}`;
      localStorage.setItem(k, JSON.stringify(answers));
    } catch {}
  }, [answers, quizId, userId]);

  // Timer
  useEffect(() => {
    if (!quiz.durationSec || result) return;
    setSecondsLeft(quiz.durationSec);
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s == null) return s;
        if (s <= 1) { clearInterval(t); onSubmit(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [quiz.durationSec, result]);

  const maxPoints = useMemo(() => quiz.questions.reduce((a, q) => a + (q.points || 0), 0), [quiz]);
  const progress = useMemo(() => {
    const required = quiz.questions.filter(q => q.required !== false);
    const answered = required.filter(q => hasAnswer(answers[q.id]));
    return Math.round((answered.length / Math.max(1, required.length)) * 100);
  }, [quiz, answers]);

  function hasAnswer(v: any) {
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "string") return v.trim().length > 0;
    return true;
  }

  function updateAnswer(q: QuizQuestion, value: any) {
    setAnswers((s) => ({ ...s, [q.id]: value }));
  }

  function validate(): string | null {
    for (const q of quiz.questions) {
      if (q.required !== false && !hasAnswer(answers[q.id])) {
        return `Please answer: ${q.title}`;
      }
    }
    return null;
  }

  async function onSubmit() {
    if (submitting || result) return;
    const v = validate();
    if (v) { setError(v); return; }
    setSubmitting(true); setError(null);
    try {
      const payload = { user_id: userId, quiz_id: quiz.id, answers };
      const r = await fetch(`/api/assessment/score`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (r.ok) {
        const data = await r.json();
        if (typeof data?.score === "number" && typeof data?.max === "number") {
          setResult({ score: data.score, max: data.max });
          return;
        }
      }
      // fallback local scoring for demo
      const local = scoreLocally(quiz, answers);
      setResult(local);
    } catch (e) {
      const local = scoreLocally(quiz, answers);
      setResult(local);
    } finally {
      setSubmitting(false);
    }
  }

  function scoreLocally(qz: QuizPayload, ans: Record<string, any>) {
    let score = 0;
    for (const q of qz.questions) {
      if (!hasAnswer(ans[q.id])) continue;
      // demo rules
      if (q.id === "q1" && ans[q.id] === "a") score += q.points || 0;
      if (q.id === "q2" && String(ans[q.id]).toLowerCase().includes("genesis")) score += q.points || 0;
      if (q.id === "q3") {
        const sel = new Set<string>(Array.isArray(ans[q.id]) ? ans[q.id] : []);
        if (sel.has("binance") && sel.has("bybit") && sel.has("okx") && !sel.has("robinhood")) score += q.points || 0;
      }
    }
    return { score, max: maxPoints };
  }

  function resetQuiz() {
    setAnswers({}); setResult(null); setSecondsLeft(quiz.durationSec || null); setError(null);
  }

  if (loading) {
    return (
      <main className="min-h-[80dvh] grid place-items-center text-white">
        <div className="flex items-center gap-2 text-white/80"><Loader2 className="h-5 w-5 animate-spin"/> Loading quiz…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted px-4 py-8 text-white">
      <div className="mx-auto max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{quiz.title}</h1>
            <div className="flex items-center gap-3">
              {quiz.durationSec != null && (
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm">
                  <Clock className="h-4 w-4"/>
                  <span>{secondsLeft != null ? secondsLeft : quiz.durationSec}s</span>
                </div>
              )}
              <div className="w-44"><ProgressBar value={progress} label="Progress"/></div>
            </div>
          </div>

          {!result ? (
            <div className="space-y-4">
              {quiz.questions.map((q, idx) => (
                <Card key={q.id} title={`Q${idx + 1}. ${q.title}`} variant="default" className="border-white/15">
                  <div className="space-y-3">
                    {q.hint && <p className="text-sm text-white/60">Hint: {q.hint}</p>}
                    {q.type === "single" && (
                      <div className="grid gap-2">
                        {q.options?.map((op) => (
                          <label key={op.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                            <input
                              type="radio"
                              name={`q_${q.id}`}
                              className="accent-indigo-500"
                              checked={answers[q.id] === op.id}
                              onChange={() => updateAnswer(q, op.id)}
                            />
                            <span>{op.label}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {q.type === "multi" && (
                      <div className="grid gap-2">
                        {q.options?.map((op) => {
                          const sel = new Set<string>(answers[q.id] || []);
                          const checked = sel.has(op.id);
                          return (
                            <label key={op.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                              <input
                                type="checkbox"
                                className="accent-indigo-500"
                                checked={checked}
                                onChange={(e) => {
                                  const next = new Set(sel);
                                  e.target.checked ? next.add(op.id) : next.delete(op.id);
                                  updateAnswer(q, Array.from(next));
                                }}
                              />
                              <span>{op.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {(q.type === "text" || q.type === "number") && (
                      <div>
                        <input
                          type={q.type === "number" ? "number" : "text"}
                          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 outline-none focus:border-indigo-400"
                          placeholder={q.hint || "Your answer…"}
                          value={answers[q.id] ?? ""}
                          onChange={(e) => updateAnswer(q, q.type === "number" ? Number(e.target.value) : e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                </Card>
              ))}

              {error && <div className="text-sm text-red-400">{error}</div>}

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button onClick={onSubmit} loading={submitting}>Submit</Button>
                <Button variant="outline" onClick={resetQuiz}><RefreshCcw className="h-4 w-4 mr-1"/> Reset</Button>
                <div className="text-xs text-white/60 flex items-center gap-1"><ShieldCheck className="h-4 w-4"/> Answers stored locally until you submit.</div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <Card variant={result.score / result.max >= 0.6 ? "success" : "warning"} title="Your result" className="border-white/15">
                <div className="flex items-center gap-4 text-3xl font-extrabold">
                  {result.score / result.max >= 0.6 ? <Trophy className="h-7 w-7 text-yellow-400"/> : <CheckCircle2 className="h-7 w-7 text-emerald-400"/>}
                  {result.score} / {result.max}
                </div>
                <p className="mt-2 text-sm text-white/70">Thanks for completing the quiz. You can retake it or proceed to the dashboard.</p>
              </Card>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => { setResult(null); setSubmitting(false); }}><RefreshCcw className="h-4 w-4 mr-1"/> Retake</Button>
                <Button variant="outline" href="/signup">Go to signup</Button>
                <Button variant="secondary" href="/">Back to home</Button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </main>
  );
}
