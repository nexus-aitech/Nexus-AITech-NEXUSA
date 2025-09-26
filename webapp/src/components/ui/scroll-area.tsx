"use client"

import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"
import { ArrowUp, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Global-grade ScrollArea
 * - Edge shadows (top/bottom/left/right) برای راهنمای بصری
 * - دکمه ScrollToTop با نمایش تدریجی
 * - اسکرول افقی/عمودی همزمان
 * - حالت‌های auto/always/hidden برای نمایش اسکرول‌بار
 * - سایزهای sm/md/lg و radius قابل تنظیم
 * - A11y: role, aria-label, keyboard friendly
 */

type ScrollbarVisibility = "auto" | "always" | "hidden"
type Size = "sm" | "md" | "lg"

export interface ProScrollAreaProps
  extends React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> {
  /** عنوان دسترس‌پذیری */
  "aria-label"?: string
  /** نمایش اسکرول‌بار */
  scrollbar?: ScrollbarVisibility
  /** اندازه پدینگ داخلی */
  size?: Size
  /** گوشه‌های گرد */
  radius?: Size
  /** نمایش دکمه برگشت به بالا */
  withScrollToTop?: boolean
  /** نمایش سایه لبه‌ها هنگام اسکرول */
  withEdgeShadows?: boolean
  /** کلاس اضافی برای Viewport داخلی */
  viewportClassName?: string
}

const radiusMap: Record<Size, string> = {
  sm: "rounded-md",
  md: "rounded-xl",
  lg: "rounded-2xl",
}

const padMap: Record<Size, string> = {
  sm: "p-2",
  md: "p-3",
  lg: "p-4",
}

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  ProScrollAreaProps
>(
  (
    {
      className,
      children,
      scrollbar = "auto",
      size = "md",
      radius = "md",
      withScrollToTop = true,
      withEdgeShadows = true,
      viewportClassName,
      ...props
    },
    ref
  ) => {
    const viewportRef = React.useRef<HTMLDivElement | null>(null)
    const [atTop, setAtTop] = React.useState(true)
    const [atBottom, setAtBottom] = React.useState(false)
    const [atLeft, setAtLeft] = React.useState(true)
    const [atRight, setAtRight] = React.useState(false)
    const [showToTop, setShowToTop] = React.useState(false)

    const onScroll = React.useCallback(() => {
      const el = viewportRef.current
      if (!el) return
      const { scrollTop, scrollHeight, clientHeight, scrollLeft, scrollWidth, clientWidth } = el

      setAtTop(scrollTop <= 1)
      setAtBottom(scrollTop + clientHeight >= scrollHeight - 1)
      setAtLeft(scrollLeft <= 1)
      setAtRight(scrollLeft + clientWidth >= scrollWidth - 1)
      setShowToTop(scrollTop > 400)
    }, [])

    React.useEffect(() => {
      const el = viewportRef.current
      if (!el) return
      onScroll()
      el.addEventListener("scroll", onScroll, { passive: true })
      return () => el.removeEventListener("scroll", onScroll)
    }, [onScroll])

    const handleScrollToTop = () => {
      viewportRef.current?.scrollTo({ top: 0, behavior: "smooth" })
    }

    // کنترل نمایش اسکرول‌بار با کلاس‌ها
    const barVisibility =
      scrollbar === "hidden"
        ? "opacity-0 pointer-events-none"
        : scrollbar === "always"
        ? "opacity-100"
        : "opacity-70 hover:opacity-100 transition-opacity"

    return (
      <ScrollAreaPrimitive.Root
        ref={ref}
        className={cn(
          "relative overflow-hidden bg-background/50 backdrop-blur supports-[backdrop-filter]:bg-background/40",
          radiusMap[radius],
          className
        )}
        {...props}
      >
        {/* Edge shadows */}
        {withEdgeShadows && (
          <>
            {/* top */}
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-black/25 to-transparent transition-opacity",
                atTop ? "opacity-0" : "opacity-100"
              )}
            />
            {/* bottom */}
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-black/25 to-transparent transition-opacity",
                atBottom ? "opacity-0" : "opacity-100"
              )}
            />
            {/* left */}
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-black/20 to-transparent transition-opacity",
                atLeft ? "opacity-0" : "opacity-100"
              )}
            />
            {/* right */}
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-black/20 to-transparent transition-opacity",
                atRight ? "opacity-0" : "opacity-100"
              )}
            />
          </>
        )}

        {/* Viewport */}
        <ScrollAreaPrimitive.Viewport
          ref={(node) => {
            viewportRef.current = node
          }}
          className={cn(
            "h-full w-full",
            radiusMap[radius],
            padMap[size],
            "scroll-smooth",
            viewportClassName
          )}
          role="region"
          aria-label={(props as any)["aria-label"] || "Scrollable content"}
        >
          {children}
        </ScrollAreaPrimitive.Viewport>

        {/* Scrollbars – vertical & horizontal */}
        <ScrollBar className={barVisibility} orientation="vertical" />
        <ScrollBar className={barVisibility} orientation="horizontal" />

        <ScrollAreaPrimitive.Corner />

        {/* Scroll to top button */}
        {withScrollToTop && (
          <button
            type="button"
            onClick={handleScrollToTop}
            className={cn(
              "group absolute bottom-4 right-4 inline-flex items-center justify-center rounded-full",
              "bg-primary text-primary-foreground shadow-lg",
              "transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              showToTop ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none",
              size === "sm" ? "h-8 w-8" : size === "lg" ? "h-12 w-12" : "h-10 w-10"
            )}
            aria-label="Scroll to top"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
      </ScrollAreaPrimitive.Root>
    )
  }
)
ScrollArea.displayName = "ScrollArea"

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "z-10 flex touch-none select-none transition-colors",
      orientation === "vertical" &&
        "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" &&
        "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className={cn(
      "relative flex-1 rounded-full",
      // ظاهر بار: باریک، کم‌نما
      "bg-border/80 hover:bg-border",
      // نشانه‌ی دسترسی: هندل کوچک وسط بار
      "after:absolute after:inset-0 after:m-auto after:h-3 after:w-3 after:rounded-full after:bg-background/30 after:opacity-0 hover:after:opacity-100"
    )}>
      {/* decorative handle */}
      <Minus className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 opacity-30" />
    </ScrollAreaPrimitive.ScrollAreaThumb>
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))
ScrollBar.displayName = "ScrollBar"

export { ScrollArea, ScrollBar }
