import './globals.css'
import { ShellNav } from "@/components/layout/ShellNav";
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Nexus-AITech',
  description: 'AI Signals, Backtesting & Reports',
  icons: {
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon', sizes: '16x16 32x32 48x48' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: '/apple-touch-icon.png'  // ← همین فایلی که ساختیم
  },
  manifest: '/site.webmanifest'
}

// 👇 themeColor را اینجا منتقل کن
export const viewport: Viewport = {
  themeColor: '#0B0F13',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <ShellNav />
        {children}
      </body>
    </html>
  );
}
