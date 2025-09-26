'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { BookOpen, Search, Terminal, Code2, Cpu, Layers } from 'lucide-react'

const sections = [
  {
    title: 'Getting Started',
    items: [
      { href: '/docs/intro', label: 'Introduction', icon: BookOpen },
      { href: '/docs/quickstart', label: 'Quickstart', icon: Terminal },
    ],
  },
  {
    title: 'Core Modules',
    items: [
      { href: '/docs/ingestion', label: 'Ingestion', icon: Cpu },
      { href: '/docs/signals', label: 'Signal Engine', icon: Layers },
      { href: '/docs/backtesting', label: 'Backtesting', icon: Code2 },
    ],
  },
  {
    title: 'API Reference',
    items: [
      { href: '/docs/api/rest', label: 'REST API', icon: Code2 },
      { href: '/docs/api/ws', label: 'WebSocket API', icon: Code2 },
    ],
  },
]

export default function DocsPage() {
  const [query, setQuery] = useState('')

  return (
    <main className="flex h-[calc(100vh-64px)]">
      {/* Sidebar */}
      <aside className="hidden md:flex w-72 border-r border-white/10 bg-black/40 backdrop-blur-xl flex-col">
        <div className="p-4">
          <Input
            placeholder="🔍 Search docs..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="rounded-xl bg-white/5 text-white placeholder:text-white/50"
          />
        </div>
        <ScrollArea className="flex-1 p-4">
          {sections.map((section) => (
            <div key={section.title} className="mb-6">
              <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wide mb-3">
                {section.title}
              </h3>
              <ul className="space-y-2">
                {section.items.map((item) => {
                  if (
                    query &&
                    !item.label.toLowerCase().includes(query.toLowerCase())
                  )
                    return null
                  const Icon = item.icon
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition"
                      >
                        <Icon size={16} />
                        {item.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </ScrollArea>
      </aside>

      {/* Main Content */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex-1 p-6 overflow-y-auto prose prose-invert max-w-4xl"
      >
        <h1 className="text-5xl font-black mb-4">📘 Documentation</h1>
        <p className="text-lg text-white/70 mb-6">
          Welcome to the <span className="font-bold text-white">NEXUSA Docs</span>.  
          Explore guides, API references, and tutorials to build on our platform.
        </p>
        <Separator className="my-6" />
        <article>
          <h2>Quick Example</h2>
          <pre className="bg-black/60 p-4 rounded-xl overflow-x-auto text-sm">
            <code className="language-ts">
{`// Fetch latest signals
const res = await fetch("/api/signals?symbol=BTCUSDT&tf=1h&limit=10")
const data = await res.json()
console.log(data)`}
            </code>
          </pre>
          <p>
            For deeper tutorials, check out the left navigation or head to our{' '}
            <Link href="/docs/api/rest" className="text-emerald-400 underline">
              REST API reference
            </Link>.
          </p>
        </article>
      </motion.section>
    </main>
  )
}
