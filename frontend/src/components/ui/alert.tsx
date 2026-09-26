import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Tinted banner with a leading icon. Every warning names what unblocks it,
 * so the description slot is where "what happens next" goes.
 */
const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-md border px-3.5 py-3 text-sm has-[>svg]:grid-cols-[18px_1fr] has-[>svg]:gap-x-2.5 [&>svg]:size-[18px] [&>svg]:translate-y-px",
  {
    variants: {
      variant: {
        default: "border-border bg-subtle text-fg [&>svg]:text-fg-secondary",
        info: "border-info-border bg-info-soft text-fg [&>svg]:text-info-text *:data-[slot=alert-title]:text-info-text",
        success:
          "border-success-border bg-success-soft text-fg [&>svg]:text-success-text *:data-[slot=alert-title]:text-success-text",
        warning:
          "border-warning-border bg-warning-soft text-fg [&>svg]:text-warning-text *:data-[slot=alert-title]:text-warning-text",
        destructive:
          "border-danger-border bg-danger-soft text-fg [&>svg]:text-danger-text *:data-[slot=alert-title]:text-danger-text",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("col-start-2 text-base font-semibold", className)}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("col-start-2 text-sm text-pretty text-fg", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, alertVariants }
