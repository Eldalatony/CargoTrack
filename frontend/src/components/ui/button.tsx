import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Verb-first actions. Hover is one step darker, press one more; no scale.
 * Sizes follow the design's control heights: 28 / 34 / 40 / 44 (touch).
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent font-medium whitespace-nowrap transition-colors duration-150 ease-standard outline-none hover:no-underline focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:border-border disabled:bg-sunken disabled:text-fg-disabled aria-invalid:ring-danger-solid/30 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-brand text-on-brand hover:bg-brand-hover hover:text-on-brand active:bg-brand-press",
        outline:
          "border-strong bg-surface text-fg hover:bg-hover hover:text-fg active:bg-press",
        ghost:
          "bg-transparent text-fg-secondary hover:bg-hover hover:text-fg active:bg-press",
        destructive:
          "bg-danger-solid text-on-danger hover:bg-danger-solid-hover hover:text-on-danger",
        "destructive-outline":
          "border-danger-border bg-surface text-danger-text hover:bg-danger-soft hover:text-danger-text",
        "destructive-ghost":
          "bg-transparent text-danger-text hover:bg-danger-soft hover:text-danger-text",
        link: "h-auto! border-0 px-0! text-link hover:text-link-hover hover:underline",
      },
      size: {
        sm: "h-7 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        default: "h-8.5 px-3.5 text-sm",
        lg: "h-10 px-4 text-sm",
        touch: "h-11 px-4 text-base",
        icon: "size-8.5",
        "icon-sm": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
