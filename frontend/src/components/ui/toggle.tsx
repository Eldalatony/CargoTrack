"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Toggle as TogglePrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

const toggleVariants = cva(
  "inline-flex items-center justify-center gap-1.5 font-medium whitespace-nowrap text-fg-secondary transition-colors duration-150 outline-none hover:bg-hover hover:text-fg focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-fg-disabled data-[state=on]:bg-brand-soft data-[state=on]:font-semibold data-[state=on]:text-brand-text [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "rounded-md bg-transparent",
        outline: "rounded-md border border-strong bg-surface",
      },
      size: {
        sm: "h-7 px-2.5 text-xs",
        default: "h-8.5 px-3 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
