// src/app/reports/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reports — NEXUSA",
  description: "LLM-powered reports and analytics",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
