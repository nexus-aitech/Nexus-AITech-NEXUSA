// =============================================================
// SIGNUP WIZARD COMPONENT — webapp/src/components/auth/SignupWizard.tsx
// =============================================================
"use client";
import * as React from "react";
import Image from "next/image";
import { z } from "zod";


const step1Schema = z.object({
email: z.string().email(),
countryCode: z.string().min(1),
phone: z.string().min(6),
});


export default function SignupWizard({ redirectOnDone = "/" }: { redirectOnDone?: string }) {
const [step, setStep] = React.useState(1);
const [pendingUserId, setPendingUserId] = React.useState<string | null>(null);
const [email, setEmail] = React.useState("");
const [countryCode, setCountryCode] = React.useState("98");
const [phone, setPhone] = React.useState("");
const [loading, setLoading] = React.useState(false);
const [error, setError] = React.useState<string | null>(null);


async function initRegister() {
setError(null);
const parse = step1Schema.safeParse({ email, countryCode, phone });
if (!parse.success) { setError("ورودی نامعتبر"); return; }
setLoading(true);
try {
const res = await fetch("/api/auth/register/init", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parse.data) });
const json = await res.json();
if (!res.ok) throw new Error(json?.error || "خطا");
setPendingUserId(json.userId);
setStep(2);
} catch (e: any) { setError(e.message); } finally { setLoading(false); }
}


async function verify(kind: "email" | "phone", code: string) {
setError(null);
setLoading(true);
try {
const res = await fetch(`/api/auth/verify-${kind}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: pendingUserId, code }) });
const json = await res.json();
if (!res.ok) throw new Error(json?.error || "کد نادرست است");
setStep(kind === "email" ? 3 : 4);
} catch (e: any) { setError(e.message); } finally { setLoading(false); }
}


async function startKyc() {
setError(null); setLoading(true);
try {
const res = await fetch("/api/kyc/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: pendingUserId }) });
const json = await res.json();
if (!res.ok) throw new Error(json?.error || "KYC error");
// open provider in new tab
window.open(json.url, "_blank", "noopener,noreferrer");
setStep(5); // move to finalize; in real app you may poll webhook status
}