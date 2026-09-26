import * as React from "react"

import { cn } from "@/lib/utils"

const controlClasses =
  "w-full min-w-0 rounded-md border border-strong bg-surface text-sm text-fg transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-fg-tertiary focus-visible:border-[var(--border-focus)] focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-sunken disabled:text-fg-disabled aria-invalid:border-danger-solid aria-invalid:ring-danger-solid/25"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        controlClasses,
        "h-8.5 px-2.5 file:mr-2 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-fg",
        className
      )}
      {...props}
    />
  )
}

/** An input with a trailing unit, e.g. "USD" or "CBM". Numbers right-align. */
function UnitInput({
  unit,
  className,
  wrapperClassName,
  ...props
}: React.ComponentProps<"input"> & { unit: string; wrapperClassName?: string }) {
  return (
    <div className={cn("relative flex items-center", wrapperClassName)}>
      <Input
        inputMode="decimal"
        className={cn("pr-12 text-right tabular-nums", className)}
        {...props}
      />
      <span className="pointer-events-none absolute right-2.5 text-sm text-fg-tertiary">
        {unit}
      </span>
    </div>
  )
}

export { Input, UnitInput, controlClasses }
