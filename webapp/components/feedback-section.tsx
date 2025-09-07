"use client";

import { Primary, Ghost } from "@/components/ui/Button";
import { useState } from "react";

export default function FeedbackSection() {
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = Object.fromEntries(new FormData(e.currentTarget).entries());
      await fetch("/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      alert("Thank you for your feedback.");
      (e.currentTarget as HTMLFormElement).reset();
    } catch {
      alert("Submission failed. Please try again later.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10 grid gap-6 text-white">
      <form onSubmit={submit} className="grid gap-3">
        <input
          name="email"
          type="email"
          placeholder="Email (optional)"
          className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-white placeholder-white/40"
        />
        <textarea
          name="message"
          rows={5}
          placeholder="Your feedback..."
          className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-white placeholder-white/40"
          required
        />
        <div className="flex gap-2">
          <Primary type="submit" disabled={loading}>
            {loading ? "Sending..." : "Send feedback"}
          </Primary>
          <Ghost type="reset">Clear</Ghost>
        </div>
      </form>
    </div>
  );
}
