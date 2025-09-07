import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NEXUSA',
  description: 'AI Signals, Backtesting & Reports',
  icons: {
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon', sizes: '16x16 32x32 48x48' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
}

// 👇 viewport کامل و استاندارد موبایل/تبلت/دسکتاپ
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,     // اجازه‌ی زوم برای A11y
  viewportFit: 'cover',// رعایت safe-area روی iOS
  themeColor: '#0B0F13',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  )
}
