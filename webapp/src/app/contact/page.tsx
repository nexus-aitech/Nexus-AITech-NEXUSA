"use client";
import { Primary, Ghost } from "@/components/ui/Button";
import { useState } from "react";

export default function ContactSection() {
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = Object.fromEntries(new FormData(e.currentTarget).entries());
      await fetch("/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      alert("Your request has been submitted. We will get back to you soon.");
      e.currentTarget.reset();
    } catch {
      alert("Submission failed. Please try again later.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 grid gap-10 text-white">
      {/* Contact Info */}
      <div className="space-y-4">
        <p>🌐 Website: <a href="https://www.nexus-aitech.net" target="_blank" rel="noopener noreferrer">nexus-aitech.net</a></p>
        <p>📧 Email:
          <a href="mailto:eliasmohseni22@gmail.com"> eliasmohseni22@gmail.com</a>, 
          <a href="mailto:nexusaitech8@gmail.com"> nexusaitech8@gmail.com</a>
        </p>
        <p>💬 Telegram: <a href="https://t.me/NexusAITech2025" target="_blank" rel="noopener noreferrer">@NexusAITech2025</a></p>
        <p>🔗 LinkedIn: <a href="https://www.linkedin.com/in/nexus-aitech" target="_blank" rel="noopener noreferrer">linkedin.com/in/nexus-aitech</a></p>
        <p>🐦 X (Twitter): <a href="https://x.com/NexusAITech2025" target="_blank" rel="noopener noreferrer">@NexusAITech2025</a></p>
      </div>

      {/* Contact Form */}
      <form onSubmit={submit} className="grid gap-3">
        <input
          name="name"
          placeholder="Name"
          className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-white placeholder-white/40"
        />
        <input
          name="email"
          type="email"
          placeholder="Email"
          className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-white placeholder-white/40"
        />
        <input
          name="company"
          placeholder="Company / Organization"
          className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-white placeholder-white/40"
        />
        <textarea
          name="message"
          rows={4}
          placeholder="Your message..."
          className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-white placeholder-white/40"
        />
        <div className="flex gap-2">
          <Primary type="submit" disabled={loading}>
            {loading ? "Sending..." : "Send"}
          </Primary>
          <Ghost type="reset">Clear</Ghost>
        </div>
      </form>
    </div>
  );
}
