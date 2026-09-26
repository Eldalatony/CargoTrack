import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Chip geometry shared by every status. Colour is spent on the journey:
 * neutral → info → solid brand (moving) → success soft → solid success
 * (final). Exceptions keep the shape: void is a dashed outline, danger and
 * warning are tinted.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center rounded-sm border font-medium whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "border-border bg-subtle text-fg-secondary",
        info: "border-info-border bg-info-soft text-info-text",
        brand: "border-brand bg-brand text-on-brand",
        "brand-soft": "border-brand-soft-border bg-brand-soft text-brand-text",
        success: "border-success-border bg-success-soft text-success-text",
        final: "border-success-solid bg-success-solid text-on-success",
        void: "border-dashed border-strong bg-transparent text-fg-tertiary",
        danger: "border-danger-border bg-danger-soft text-danger-text",
        "danger-solid": "border-danger-solid bg-danger-solid text-on-danger",
        warning: "border-warning-border bg-warning-soft text-warning-text",
        sunken: "border-border bg-sunken text-fg-secondary",
      },
      size: {
        sm: "h-5 gap-[5px] px-1.5 text-2xs [&>svg]:size-[11px]",
        default: "h-6 gap-1.5 px-2 text-xs [&>svg]:size-3",
      },
    },
    defaultVariants: {
      tone: "neutral",
      size: "default",
    },
  }
)

function Badge({
  className,
  tone,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ tone, size }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
