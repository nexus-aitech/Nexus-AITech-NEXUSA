'use client'

import React, { Suspense, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { motion } from 'framer-motion'
import Header from '@/components/layout/Header'
import Hero from '@/components/layout/Hero'
import DataOverview from '@/components/widgets/DataOverview'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowRight, ShieldCheck, Zap, Sparkles } from 'lucide-react'

// ===== Lazy imports for heavy sections and widgets
const LiveOhlcvTicker = dynamic(() => import('@/components/LiveOhlcvTicker'), { ssr: false })
const CoreCapabilities = dynamic(() => import('@/components/sections/CoreCapabilities'), { ssr: false })
const Feedback = dynamic(() => import('@/components/sections/Feedback'), { ssr: false })

// ===== React‑Three‑Fiber (WebGL). We guard for SSR and reduced motion.
const Canvas = dynamic(() => import('@react-three/fiber').then(m => m.Canvas), { ssr: false }) as any
const useFrame = dynamic(() => import('@react-three/fiber').then(m => m.useFrame), { ssr: false }) as any
const Drei = {
  OrbitControls: dynamic(() => import('@react-three/drei').then(m => m.OrbitControls), { ssr: false }) as any,
  Environment: dynamic(() => import('@react-three/drei').then(m => m.Environment), { ssr: false }) as any,
  Html: dynamic(() => import('@react-three/drei').then(m => m.Html), { ssr: false }) as any,
  Float: dynamic(() => import('@react-three/drei').then(m => m.Float), { ssr: false }) as any,
  MeshDistortMaterial: dynamic(() => import('@react-three/drei').then(m => (m as any).MeshDistortMaterial), { ssr: false }) as any,
}

// ===== 3D brand sphere (merged + refined)
function BrandSphere({ brandText = 'NEXUSA' }: { brandText?: string }) {
  const [rot, setRot] = useState(0)
  useFrame?.((_, delta: number) => setRot((r: number) => (r + delta * 0.25) % (Math.PI * 2)))

  return (
    <group rotation={[0.2, rot, 0]}>
      <mesh castShadow receiveShadow>
        <icosahedronGeometry args={[1.6, 6]} />
        {/* @ts-ignore three/drei dynamic */}
        <Drei.MeshDistortMaterial
          color="#5b8ef7"
          emissive="#2848a5"
          emissiveIntensity={0.3}
          roughness={0.2}
          metalness={0.4}
          distort={0.3}
          speed={1.2}
        />
      </mesh>
      {/* soft halo */}
      <mesh>
        <sphereGeometry args={[1.72, 64, 64]} />
        <meshBasicMaterial color="#7aa0ff" transparent opacity={0.08} />
      </mesh>
      {/* floating label */}
      {/* @ts-ignore three/drei dynamic */}
      <Drei.Float speed={1.5} rotationIntensity={0.2} floatIntensity={1.5}>
        {/* @ts-ignore */}
        <Drei.Html center distanceFactor={6} transform>
          <div className="select-none pointer-events-none text-center">
            <div className="text-3xl md:text-4xl font-extrabold tracking-widest bg-gradient-to-r from-blue-200 to-indigo-200 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(90,135,255,0.35)]">
              {brandText}
            </div>
          </div>
        </Drei.Html>
      </Drei.Float>
      {/* lights */}
      <pointLight position={[3, 2, 2]} intensity={1.3} color="#7eaaff" />
      <pointLight position={[-2, -1, -1]} intensity={0.6} color="#4455ff" />
      <ambientLight intensity={0.35} />
    </group>
  )
}

export default function Page() {
  // ===== Motion/GL capability guards
  const [canRender3D, setCanRender3D] = useState(false)
  const prefersReduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  )

  useEffect(() => {
    if (prefersReduced) return setCanRender3D(false)
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      setCanRender3D(!!gl)
    } catch {
      setCanRender3D(false)
    }
  }, [prefersReduced])

  return (
    <div className="relative min-h-[calc(100dvh)] selection:bg-emerald-400/20 selection:text-emerald-100">
      {/* ===== Animated BG layer */}
      <div className="absolute inset-0 -z-10">
        {canRender3D ? (
          <Suspense fallback={<div className="w-full h-full bg-[#0b1220]" />}> 
            {/* @ts-ignore */}
            <Canvas dpr={[1, 1.8]} camera={{ position: [0, 0, 4.2], fov: 45 }} shadows gl={{ antialias: true }}>
              <color attach="background" args={["#0b1220"]} />
              {/* @ts-ignore */}
              <Drei.Environment preset="city" />
              <BrandSphere />
              {/* @ts-ignore */}
              <Drei.OrbitControls enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={0.6} />
            </Canvas>
          </Suspense>
        ) : (
          <div className="w-full h-full bg-[radial-gradient(circle_at_center,rgba(49,84,212,0.35),transparent_70%),#0b1220]" />
        )}
      </div>

      {/* ===== Header + Hero */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-2">
        <Header />
        <Hero />
      </div>

      {/* ===== Primary CTAs & feature highlights (merged from both files) */}
      <section className="relative z-10 container-responsive pt-6">
        <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.35 }}>
          <Badge variant="secondary" className="mb-3">AI-first • Web3-native • Real-time</Badge>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild><Link href="/signup"><span className="flex items-center">Get started <ArrowRight className="ml-1 h-4 w-4" /></span></Link></Button>
            <Button asChild variant="secondary"><Link href="/pricing"><span>See pricing</span></Link></Button>
            <Button asChild variant="secondary"><Link href="/data-signals"><span>Live data</span></Link></Button>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {[
              { icon: <ShieldCheck className="h-4 w-4" />, title: 'Security first', text: 'TLS everywhere, OAuth, role-based access' },
              { icon: <Zap className="h-4 w-4" />, title: 'Low-latency', text: 'Sub-100ms streaming & optimized pipelines' },
              { icon: <Sparkles className="h-4 w-4" />, title: 'Developer-friendly', text: 'SDKs, webhooks, and great docs' },
            ].map((f, i) => (
              <Card key={i} className="glass"><CardContent className="p-4"><div className="flex items-center gap-2 text-sm font-medium">{f.icon}<span>{f.title}</span></div><p className="mt-1 text-xs text-white/70">{f.text}</p></CardContent></Card>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ===== Intro + KPIs (FA) */}
      <section id="intro" className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-8">
        <h2 className="text-2xl font-bold text-white mb-4">معرفی</h2>
        <p className="text-gray-300">پلتفرم Nexus-AITech نسل جدیدی از ابزارهای تحلیلی و معاملاتی برای بازارهای مالی است.</p>
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          <div><p className="text-3xl font-bold text-emerald-400">48h</p><p className="text-gray-400">Free Trial</p></div>
          <div><p className="text-3xl font-bold text-emerald-400">7+</p><p className="text-gray-400">Exchanges</p></div>
          <div><p className="text-3xl font-bold text-emerald-400">4.9/5</p><p className="text-gray-400">User Rating</p></div>
          <div><p className="text-3xl font-bold text-emerald-400">Realtime</p><p className="text-gray-400">Data</p></div>
        </div>
      </section>

      {/* ===== Capabilities */}
      <section id="capabilities" className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 mt-10">
        <CoreCapabilities />
      </section>

      {/* ===== Data & Signals */}
      <section id="data-overview" className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 mt-10" aria-labelledby="section-data">
        <h2 id="section-data" className="text-2xl font-bold text-white mb-4">Data &amp; Signals</h2>
        <DataOverview />
        <div className="mt-10"><LiveOhlcvTicker /></div>
      </section>

      {/* ===== Supported Exchanges */}
      <section id="integrations" className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 mt-16">
        <h2 className="text-2xl font-bold text-white mb-6">Supported Exchanges</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-6 items-center">
          <img src="/logos/binance.png" alt="Binance" className="h-10 mx-auto" />
          <img src="/logos/bybit.png" alt="Bybit" className="h-10 mx-auto" />
          <img src="/logos/okx.png" alt="OKX" className="h-10 mx-auto" />
          <img src="/logos/coinex.png" alt="CoinEx" className="h-10 mx-auto" />
          <img src="/logos/bitget.png" alt="Bitget" className="h-10 mx-auto" />
          <img src="/logos/bingx.png" alt="BingX" className="h-10 mx-auto" />
          <img src="/logos/kucoin.png" alt="KuCoin" className="h-10 mx-auto" />
        </div>
      </section>

      {/* ===== Social proof / Feedback */}
      <section id="feedback" className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 mt-12">
        <Feedback />
      </section>

      {/* bottom gradient fade */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />
    </div>
  )
}
