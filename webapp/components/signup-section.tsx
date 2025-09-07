"use client";
import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signupSchema, type SignupInput } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";


function strengthScore(pw: string) {
let score = 0;
if (pw.length >= 8) score++;
if (/[A-Z]/.test(pw)) score++;
if (/[a-z]/.test(pw)) score++;
if (/[0-9]/.test(pw)) score++;
if (/[^A-Za-z0-9]/.test(pw)) score++;
return score; // 0..5
}


export default function SignupSection() {
const router = useRouter();
const [serverError, setServerError] = React.useState<string | null>(null);
const [loading, setLoading] = React.useState(false);


const form = useForm<SignupInput>({
resolver: zodResolver(signupSchema),
defaultValues: { email: "", password: "", fullName: "", agree: false },
mode: "onChange",
});


const s = strengthScore(form.watch("password"));


async function onSubmit(values: SignupInput) {
setServerError(null);
setLoading(true);
try {
const res = await fetch("/api/auth/signup", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify(values),
});
const data = await res.json();
if (!res.ok) throw new Error(data?.message || "ثبت‌نام ناموفق بود");
router.push("/verify?email=" + encodeURIComponent(values.email));
} catch (err: any) {
setServerError(err.message);
} finally {
setLoading(false);
}
}


return (
<div dir="rtl" className="min-h-[80vh] grid place-items-center px-4">
<Card className="w-full max-w-md">
<CardHeader>
<CardTitle className="text-2xl font-extrabold">ساخت حساب NEXUSA</CardTitle>
</CardHeader>
<CardContent>
<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
<div className="space-y-2">
}