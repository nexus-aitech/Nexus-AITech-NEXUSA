"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Bug, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
      <AlertTriangle className="h-16 w-16 text-red-500 mb-4" />
      <h1 className="text-3xl font-bold mb-2">Something went wrong</h1>
      <p className="text-white/70 mb-6">
        We encountered an unexpected error. Please try again or contact support.
      </p>

      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild variant="secondary">
          <Link href="/">
            <span className="flex items-center">
              <Home className="mr-2 h-4 w-4" /> Go home
            </span>
          </Link>
        </Button>

        <Button asChild variant="secondary">
          <Link href="/diagnostics">
            <span className="flex items-center">
              <Bug className="mr-2 h-4 w-4" /> Run diagnostics
            </span>
          </Link>
        </Button>

        <Button asChild>
          <Link
            href={{
              pathname: "/contact",
              query: { topic: "support", ref: "error" },
            }}
          >
            <span className="flex items-center">
              <AlertTriangle className="mr-2 h-4 w-4" /> Contact support
            </span>
          </Link>
        </Button>
      </div>
    </div>
  );
}
