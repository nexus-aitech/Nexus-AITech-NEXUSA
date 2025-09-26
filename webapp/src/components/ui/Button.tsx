"use client"

import * as React from "react"
import Link from "next/link"
import { Slot } from "@radix-ui/react-slot"
import { Loader2 } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-semibold transition rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 select-none",
  {
    variants: {
      variant: {
        primary: "bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-400",
        secondary: "bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-400",
        ghost: "bg-transparent text-white hover:bg-white/10 focus:ring-white/30",
        outline: "border border-white/20 text-white hover:bg-white/5 focus:ring-white/40",
        danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-400",
        success: "bg-green-600 text-white hover:bg-green-700 focus:ring-green-400",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/80 focus:ring-destructive/50",
      },
      size: {
        xs: "px-2 py-1 text-xs rounded-lg",
        sm: "px-3 py-1.5 text-sm rounded-lg",
        md: "px-4 py-2 text-sm rounded-lg",
        lg: "px-5 py-2.5 text-base rounded-xl",
        xl: "px-6 py-3 text-lg rounded-2xl",
      },
      fullWidth: {
        true: "w-full",
      },
      loading: {
        true: "cursor-wait opacity-75",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  href?: string
  icon?: React.ReactNode
  iconRight?: React.ReactNode
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      asChild = false,
      href,
      icon,
      iconRight,
      loading,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const classes = cn(
      buttonVariants({ variant, size, fullWidth, loading }),
      className
    )

    // حالت asChild → فقط یک فرزند واحد
    if (asChild) {
      return (
        <Slot
          ref={ref as any}
          {...props}
          className={classes}
          aria-disabled={disabled || loading}
        >
          <span className="flex items-center gap-2">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              icon && <span className="flex-shrink-0">{icon}</span>
            )}
            <span className="truncate">{children}</span>
            {!loading && iconRight && (
              <span className="flex-shrink-0">{iconRight}</span>
            )}
          </span>
        </Slot>
      )
    }

    // حالت لینک
    if (href) {
      return (
        <Link
          href={href}
          className={classes}
          aria-disabled={disabled || loading}
          {...props}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            icon && <span className="flex-shrink-0">{icon}</span>
          )}
          <span className="truncate">{children}</span>
          {!loading && iconRight && (
            <span className="flex-shrink-0">{iconRight}</span>
          )}
        </Link>
      )
    }

    // حالت دکمه عادی
    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || loading}
        aria-disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          icon && <span className="flex-shrink-0">{icon}</span>
        )}
        <span className="truncate">{children}</span>
        {!loading && iconRight && (
          <span className="flex-shrink-0">{iconRight}</span>
        )}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
