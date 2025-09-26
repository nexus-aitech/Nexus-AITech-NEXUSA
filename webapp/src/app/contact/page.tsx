'use client'

import React, { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Send, Loader2, CheckCircle2, AlertTriangle, ShieldCheck, Paperclip, Mail, Globe, MessageSquare } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'

// NOTE: put metadata in a server component/layout for best practice. Kept minimal client-only UI here.

// Payload types
type ContactPayload = {
  name: string
  email: string
  company?: string
  website?: string
  topic: 'sales' | 'partnership' | 'support' | 'other'
  budget?: 'lt1k' | '1k-5k' | '5k-20k' | 'gt20k'
  urgency: 'low' | 'normal' | 'high'
  message: string
  consent_contact: boolean
  attachments?: { name: string; type: string; size: number; dataUrl?: string }[]
  // anti-spam
  hp_field?: string
  captcha_token?: string
  meta?: Record<string, any>
}

const MAX_ATTACH = 3
const MAX_ATTACH_SIZE = 5 * 1024 * 1024 // 5MB per file

export default function ContactPage() {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [website, setWebsite] = useState('')
  const [topic, setTopic] = useState<ContactPayload['topic']>('sales')
  const [budget, setBudget] = useState<ContactPayload['budget']>()
  const [urgency, setUrgency] = useState<ContactPayload['urgency']>('normal')
  const [message, setMessage] = useState('')
  const [consent, setConsent] = useState(true)
  const [attachments, setAttachments] = useState<ContactPayload['attachments']>([])
  const [honeypot, setHoneypot] = useState('') // bots fill this

  const validationError = useMemo(() => {
    if (!name.trim()) return 'Please enter your name.'
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'A valid email is required.'
    if (!message.trim() || message.trim().length < 20) return 'Please provide at least 20 characters in the message.'
    if (!consent) return 'You must allow us to contact you back.'
    return null
  }, [name, email, message, consent])

  function onFilesSelected(files: FileList | null) {
    if (!files) return
    const current = attachments ?? []
    const remainingSlots = MAX_ATTACH - current.length
    if (remainingSlots <= 0) return

    const picked = Array.from(files).slice(0, remainingSlots)
    const safe = picked.filter(f => f.size <= MAX_ATTACH_SIZE)

    const readers = safe.map(
      (file) =>
        new Promise<{ name: string; type: string; size: number; dataUrl?: string }>((resolve) => {
          const r = new FileReader()
          r.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: String(r.result) })
          r.readAsDataURL(file)
        })
    )
    Promise.all(readers).then((loaded) => setAttachments((prev) => [...(prev ?? []), ...loaded]))
  }

  async function submit() {
    setError(null)
    if (validationError) { setError(validationError); return }
    setLoading(true)
    try {
      const payload: ContactPayload = {
        name: name.trim(),
        email: email.trim(),
        company: company.trim() || undefined,
        website: website.trim() || undefined,
        topic,
        budget,
        urgency,
        message: message.trim(),
        consent_contact: consent,
        attachments,
        hp_field: honeypot || undefined,
        meta: {
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
          lang: typeof navigator !== 'undefined' ? navigator.language : undefined,
        },
      }

      const res = await fetch('/api/contact/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())

      setSuccess(true)
      // Reset form
      setName(''); setEmail(''); setCompany(''); setWebsite('');
      setTopic('sales'); setBudget(undefined); setUrgency('normal'); setMessage('');
      setAttachments([]); setHoneypot(''); setConsent(true)
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[100svh] bg-black text-white px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="text-center">
          <Badge variant="secondary" className="mb-3">Contact NEXUSA</Badge>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">Let’s build something great</h1>
          <p className="mt-2 text-white/70">Enterprise deals, partnerships, or support — we usually reply within 1–2 business days.</p>
        </motion.div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {/* Left: Info */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5"/> Contact Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-white/80">
              <p className="flex items-center gap-2"><Mail className="h-4 w-4"/> eliasmohseni22@gmail.com</p>
              <p className="flex items-center gap-2"><Mail className="h-4 w-4"/> nexusaitech8@gmail.com</p>
              <p className="flex items-center gap-2"><Globe className="h-4 w-4"/> nexus-aitech.net</p>
              <p className="flex items-center gap-2"><MessageSquare className="h-4 w-4"/> Telegram: @NexusAITech2025</p>
            </CardContent>
          </Card>

          {/* Right: Form */}
          <Card className="lg:col-span-2 bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><MessageSquare className="h-5 w-5"/> Send a message</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <div className="relative">
                    <Input id="name" placeholder="Your full name" value={name} onChange={(e) => setName(e.target.value)} />
                    {/* Honeypot hidden field */}
                    <input aria-hidden name="website_url" tabIndex={-1} className="hidden" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company">Company</Label>
                  <Input id="company" placeholder="Company / Organization" value={company} onChange={(e) => setCompany(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website (optional)</Label>
                  <Input id="website" placeholder="https://example.com" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="topic">Topic</Label>
                  <Select value={topic} onValueChange={(v) => setTopic(v as ContactPayload['topic'])}>
                    <SelectTrigger id="topic"><SelectValue placeholder="Choose a topic"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sales">Sales</SelectItem>
                      <SelectItem value="partnership">Partnership</SelectItem>
                      <SelectItem value="support">Support</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="budget">Budget (optional)</Label>
                  <Select value={budget} onValueChange={(v) => setBudget(v as ContactPayload['budget'])}>
                    <SelectTrigger id="budget"><SelectValue placeholder="Select a range"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lt1k">&lt; $1k</SelectItem>
                      <SelectItem value="1k-5k">$1k–$5k</SelectItem>
                      <SelectItem value="5k-20k">$5k–$20k</SelectItem>
                      <SelectItem value="gt20k">&gt; $20k</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="urgency">Urgency</Label>
                  <Select value={urgency} onValueChange={(v) => setUrgency(v as ContactPayload['urgency'])}>
                    <SelectTrigger id="urgency"><SelectValue placeholder="How urgent?"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea id="message" rows={6} placeholder="How can we help?" value={message} onChange={(e) => setMessage(e.target.value)} />
                <p className="text-xs text-white/60">Avoid sharing secrets, API keys, or sensitive personal data.</p>
              </div>

              {/* Attachments */}
              <div className="space-y-2">
                <Label>Attachments (up to {MAX_ATTACH}, ≤ {Math.round(MAX_ATTACH_SIZE/1024/1024)}MB each)</Label>
                <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4"/>
                    <input
                      type="file"
                      multiple
                      accept="image/*,application/pdf"
                      onChange={(e) => onFilesSelected(e.target.files)}
                    />
                  </div>
                  {!!attachments?.length && (
                    <ul className="mt-3 space-y-1 list-disc list-inside text-white/80">
                      {attachments.map((f, i) => (
                        <li key={`${f.name}-${i}`}>{f.name} – {Math.round(f.size/1024)} KB</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Consent */}
              <div className="flex items-center gap-2 text-sm">
                <Checkbox id="consent" checked={!!consent} onCheckedChange={(v) => setConsent(!!v)} />
                <Label htmlFor="consent" className="cursor-pointer text-white/80">I allow NEXUSA to contact me about my inquiry.</Label>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-md border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-200">
                  <AlertTriangle className="h-4 w-4"/> {error}
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-white/60">
                  <ShieldCheck className="h-4 w-4"/> Protected by rate limiting, honeypot, and optional CAPTCHA.
                </div>
                <Button onClick={submit} disabled={loading}>
                  {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Sending</>) : (<><Send className="mr-2 h-4 w-4"/>Send</>)}
                </Button>
              </div>

              <Separator className="my-2" />
              <p className="text-xs text-white/50">By submitting, you agree to our <a className="underline" href="/legal/terms">Terms</a> and <a className="underline" href="/legal/privacy">Privacy Policy</a>.</p>
            </CardContent>
          </Card>
        </div>

        {success && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mt-6">
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-5 text-center space-y-2">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400"/>
                <h3 className="font-semibold">Thanks! We received your message.</h3>
                <p className="text-sm text-white/70">Our team will reach out shortly if we need more details.</p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  )
}
