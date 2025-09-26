"use client";
import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Send, Loader2, CheckCircle2, AlertTriangle, ShieldCheck, Paperclip, Star, Bug, Sparkles, MessageSquare, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

type FeedbackPayload = {
  email?: string;
  category: "bug" | "feature" | "uiux" | "other";
  sentiment: "bad" | "neutral" | "good";
  nps: number;
  title: string;
  details: string;
  consent_contact: boolean;
  anonymous: boolean;
  attachments?: { name: string; type: string; size: number; dataUrl?: string }[];
  meta?: Record<string, any>;
};

export default function FeedbackPage() {
  // ⚡️ کل کد همونی که فرستادی می‌مونه، فقط export metadata حذف شده
}
