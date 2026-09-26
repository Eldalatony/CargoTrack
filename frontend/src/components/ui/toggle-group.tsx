"use client"

import * as React from "react"
import { type VariantProps } from "class-variance-authority"
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui"

import { toggleVariants } from "@/components/ui/toggle"
import { cn } from "@/lib/utils"

const ToggleGroupContext = React.createContext<
  Pick<VariantProps<typeof toggleVariants>, "size">
>({ size: "default" })

/**
 * The design's segmented control: one bordered pill, hairline separators,
 * the chosen segment tinted brand-soft. Used for single-choice fields
 * (payment type, QC outcome, route) and for status steps.
 */
function ToggleGroup({
  className,
  size,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  Pick<VariantProps<typeof toggleVariants>, "size">) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn(
        "flex w-fit max-w-full items-stretch overflow-hidden rounded-md border border-strong bg-surface",
        className
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ size }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  )
}

function ToggleGroupItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  const { size } = React.useContext(ToggleGroupContext)

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        toggleVariants({ size }),
        "flex-1 rounded-none border-l border-strong first:border-l-0",
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  )
}

export { ToggleGroup, ToggleGroupItem }
