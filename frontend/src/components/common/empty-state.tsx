import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** Says what's missing and what to do about it. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = "neutral",
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  tone?: "neutral" | "success";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex max-w-[380px] flex-col items-center gap-2 px-6 py-12 text-center",
        className,
      )}
    >
      <span
        className={cn(
          "flex size-11 items-center justify-center rounded-lg border",
          tone === "success"
            ? "rounded-full border-success-border bg-success-soft text-success-text"
            : "border-border bg-subtle text-fg-tertiary",
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="mt-1 text-lg font-semibold">{title}</div>
      {description && (
        <div className="text-sm text-pretty text-fg-secondary">{description}</div>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** A dashed placeholder inside a card ("No inspections yet…"). */
export function DashedNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-strong p-3.5 text-center text-sm text-fg-secondary">
      {children}
    </div>
  );
}
