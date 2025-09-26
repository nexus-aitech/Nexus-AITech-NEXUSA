// src/app/signup/layout.tsx
export const metadata = {
  title: "Sign Up • NEXUSA",
  description: "Create your NEXUSA account. 48h free trial, then choose Basic, Pro, or Custom with secure Stripe billing.",
  robots: { index: true, follow: true },
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
