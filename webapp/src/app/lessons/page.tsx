"use client";
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Timer, CheckCircle2, AlertCircle, RefreshCcw, ChevronRight, ChevronLeft, Loader2, Flag } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

// Example quiz (fallback if API not available)
const FALLBACK_QUIZ = {
  quiz_id: "crypto-basics",
  title: "Crypto Basics Quiz",
  duration_sec: 300,
  questions: [
    {
      id: "q1",
      type: "single",
      title: "BTC total supply?",
      options: [
        { id: "a", label: "21 million" },
        { id: "b", label: "Unlimited" },
        { id: "c", label: "210 million" },
      ],
    },
    {
      id: "q2",
      type: "short",
      title: "First BTC block name?",
    },
    {
      id: "q3",
      type: "single",
      title: "Who introduced Bitcoin?",
      options: [
        { id: "a", label: "Vitalik Buterin" },
        { id: "b", label: "Satoshi Nakamoto" },
        { id: "c", label: "Elon Musk" },
      ],
    },
  ],
};

export default function QuizPage() {
  const [quiz, setQuiz] = useState(FALLBACK_QUIZ);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remaining, setRemaining] = useState(FALLBACK_QUIZ.duration_sec);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setRemaining((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current as any);
          handleSubmit(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => timerRef.current && clearInterval(timerRef.current);
  }, []);

  const totalQuestions = quiz.questions.length;
  const currentQ = quiz.questions[currentIndex];
  const progress = useMemo(() => Math.round(((Object.keys(answers).length) / totalQuestions) * 100), [answers, totalQuestions]);
  const remainingClock = useMemo(() => {
    const m = Math.floor(remaining / 60).toString().padStart(2, "0");
    const s = Math.floor(remaining % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }, [remaining]);

  const setAnswer = useCallback((qid: string, value: any) => setAnswers((prev) => ({ ...prev, [qid]: value })), []);
  const toggleFlag = (qid: string) => setFlagged((f) => ({ ...f, [qid]: !f[qid] }));

  async function handleSubmit(auto = false) {
    setLoading(true);
    try {
      const res = await api<{ score: number; max: number }>("/assessment/score", {
        method: "POST",
        body: JSON.stringify({ user_id: "u1", quiz_id: quiz.quiz_id, answers, auto }),
      });
      setScore(res.score);
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitted(true);
      setLoading(false);
    }
  }

  function resetQuiz() {
    setAnswers({});
    setCurrentIndex(0);
    setRemaining(quiz.duration_sec);
    setSubmitted(false);
    setScore(null);
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted px-4 py-8">
        <Card className="max-w-lg w-full text-center p-6">
          <CardHeader>
            <CardTitle className="text-xl font-bold">Quiz Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
            <p className="text-lg">Your Score: {score} / {quiz.questions.length}</p>
            <p className="text-sm text-muted-foreground">Answers have been submitted and stored for analysis.</p>
            <div className="flex justify-center gap-3 mt-4">
              <Button onClick={resetQuiz} variant="secondary"><RefreshCcw className="h-4 w-4 mr-1"/> Retry</Button>
              <Button asChild>
                <a href="/reports">View Reports</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center px-4 py-8">
      <Card className="max-w-2xl w-full shadow-md">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>{quiz.title}</CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Timer className="h-4 w-4" /> {remainingClock}
            </div>
          </div>
          <Progress value={progress} className="mt-2" />
        </CardHeader>
        <CardContent className="space-y-6">
          <motion.div
            key={currentQ.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <h2 className="text-lg font-semibold">{currentQ.title}</h2>
            {currentQ.type === "short" ? (
              <Input
                type="text"
                placeholder="Your answer..."
                value={answers[currentQ.id] || ""}
                onChange={(e) => setAnswer(currentQ.id, e.target.value)}
              />
            ) : (
              <div className="space-y-2">
                {currentQ.options?.map((opt) => (
                  <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={currentQ.id}
                      value={opt.id}
                      checked={answers[currentQ.id] === opt.id}
                      onChange={(e) => setAnswer(currentQ.id, e.target.value)}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            )}
          </motion.div>

          <Separator />

          <div className="flex justify-between">
            <Button variant="secondary" disabled={currentIndex === 0} onClick={() => setCurrentIndex((i) => i - 1)}>
              <ChevronRight className="h-4 w-4 ml-1"/> Previous
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={resetQuiz}><RefreshCcw className="h-4 w-4 mr-1"/> Reset</Button>
              {currentIndex < totalQuestions - 1 ? (
                <Button onClick={() => setCurrentIndex((i) => i + 1)}>Next <ChevronLeft className="h-4 w-4 ml-1"/></Button>
              ) : (
                <Button onClick={() => handleSubmit(false)} disabled={loading}>
                  {loading ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin"/>Submitting</>) : (<>Submit <CheckCircle2 className="h-4 w-4 mr-1"/></>)}
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
            <Flag className="h-3.5 w-3.5"/> You can flag questions to review later (in future versions).
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
