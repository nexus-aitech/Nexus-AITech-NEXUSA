"use client";
import { useState } from "react";
import { api } from "@/lib/api";

export default function Quiz() {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [score, setScore] = useState<string | null>(null);

  async function submit() {
    const res = await api<{ score: number }>("/assessment/score", {
      method: "POST",
      body: JSON.stringify({ user_id: "u1", quiz_id: "crypto-basics", answers })
    });
    setScore(String(res.score));
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">کوییز نمونه</h1>
      <div className="space-y-4">
        <div>
          <div>BTC total supply?</div>
          <select className="border p-2" onChange={(e) => setAnswers({ ...answers, q1: e.target.value })}>
            <option value="">--</option>
            <option value="a">21 million</option>
            <option value="b">Unlimited</option>
            <option value="c">210 million</option>
          </select>
        </div>
        <div>
          <div>First BTC block name</div>
          <input className="border p-2" onChange={(e) => setAnswers({ ...answers, q2: e.target.value })} />
        </div>
        <button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={submit}>ارسال</button>
        {score && <div>امتیاز: {score}</div>}
      </div>
    </div>
  );
}
