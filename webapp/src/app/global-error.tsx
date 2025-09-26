"use client";

import { useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AlertTriangle, Bug, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Global Error]", error);
  }, [error]);

  return (
    <html>
      <body>
        <main
          role="alert"
          aria-live="assertive"
          className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background via-background/90 to-background/70 px-6 text-center"
        >
          {/* Error icon with animation */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="flex items-center justify-center rounded-full bg-red-500/10 p-6 mb-6"
          >
            <AlertTriangle className="h-16 w-16 text-red-500" />
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-3xl md:text-4xl font-bold tracking-tight mb-2"
          >
            Oops! Something went wrong
          </motion.h1>

          {/* Description */}
          <motion.p
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-white/70 max-w-lg mb-8"
          >
            An unexpected error has occurred. Please try again, run diagnostics, 
            or reach out to our support team.
          </motion.p>

          {/* Action buttons */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex flex-wrap justify-center gap-3"
          >
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
                  query: { topic: "support", ref: "global-error" },
                }}
              >
                <span className="flex items-center">
                  <AlertTriangle className="mr-2 h-4 w-4" /> Contact support
                </span>
              </Link>
            </Button>
          </motion.div>

          {/* Reset button (optional) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-6"
          >
            <Button
              variant="ghost"
              onClick={() => reset()}
              className="text-sm opacity-70 hover:opacity-100"
            >
              Try reloading
            </Button>
          </motion.div>
        </main>
      </body>
    </html>
  );
}
