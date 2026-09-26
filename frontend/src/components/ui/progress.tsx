"use client"

import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/** A 6px bar on a sunken track. The fill width animates (width only, per the motion rules). */
function Progress({
  className,
  indicatorClassName,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  indicatorClassName?: string
}) {
  const clamped = Math.min(100, Math.max(0, value ?? 0))

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={clamped}
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-[3px] bg-sunken",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "h-full bg-brand transition-[width] duration-[260ms] ease-standard",
          indicatorClassName
        )}
        style={{ width: `${clamped}%` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
