"use client";

import type { LucideIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * A count that doubles as a filter. Pressed = filtered by it. `alarm` turns
 * the whole tile solid red — reserved for things that need the office now.
 */
export function StatTile({
  label,
  count,
  sub,
  icon: Icon,
  iconClassName,
  active,
  alarm = false,
  onClick,
}: {
  label: string;
  count: number | undefined;
  sub: string;
  icon: LucideIcon;
  iconClassName?: string;
  active: boolean;
  alarm?: boolean;
  onClick: () => void;
}) {
  const zero = count === 0;

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer flex-col gap-0.5 rounded-lg border px-4 py-3.5 text-left transition-[background-color,border-color,box-shadow] duration-150 ease-standard outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
        alarm
          ? "border-danger-solid bg-danger-solid text-on-danger shadow-[0_0_0_4px_var(--danger-soft)]"
          : active
            ? "border-brand bg-selected shadow-[inset_0_0_0_1px_var(--accent)]"
            : "border-border bg-surface hover:border-strong",
        alarm && active && "shadow-[0_0_0_4px_var(--danger-soft),inset_0_0_0_2px_var(--on-danger)]",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className={cn("text-sm font-medium", alarm ? "text-on-danger" : "text-fg-secondary")}>
          {label}
        </span>
        <Icon
          aria-hidden
          className={cn(
            "size-[18px]",
            alarm ? "text-on-danger" : zero ? "text-fg-disabled" : iconClassName,
          )}
        />
      </span>
      {count === undefined ? (
        <Skeleton className="my-1 h-[30px] w-12" />
      ) : (
        <span
          className={cn(
            "text-4xl font-semibold tabular-nums",
            alarm ? "text-on-danger" : zero ? "text-fg-tertiary" : "text-fg",
          )}
        >
          {count}
        </span>
      )}
      <span className={cn("text-xs", alarm ? "font-medium text-on-danger" : "text-fg-secondary")}>
        {sub}
      </span>
    </button>
  );
}
