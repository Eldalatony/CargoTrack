import { CheckIcon, LockIcon, XIcon } from "lucide-react";

import type { StepState } from "./stepper";
import { cn } from "@/lib/utils";

export interface TimelineItem {
  title: string;
  time?: string;
  description?: string;
  state: StepState;
}

const DOT: Record<StepState, string> = {
  done: "border-brand bg-brand text-on-brand",
  final: "border-success-solid bg-success-solid text-on-success",
  current: "border-2 border-brand bg-surface shadow-[0_0_0_4px_var(--accent-soft)]",
  upcoming: "border-strong bg-surface",
  problem: "border-danger-solid bg-danger-solid text-on-danger",
  blocked: "border-warning-solid bg-warning-solid text-on-warning",
  cancelled: "border-strong bg-subtle text-fg-tertiary",
};

/** The journey read top to bottom — the client's "where is it". */
export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        const travelled = item.state !== "upcoming" && items[index + 1]?.state !== "upcoming";
        return (
          <li key={`${item.title}-${index}`} className="flex gap-3" aria-current={item.state === "current" ? "step" : undefined}>
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px]",
                  DOT[item.state],
                )}
              >
                {(item.state === "done" || item.state === "final") && <CheckIcon className="size-3" strokeWidth={3} />}
                {(item.state === "problem" || item.state === "cancelled") && <XIcon className="size-3" strokeWidth={3} />}
                {item.state === "blocked" && <LockIcon className="size-3" />}
                {item.state === "current" && <span className="size-2 rounded-full bg-brand" />}
              </span>
              {!last && (
                <span
                  className={cn(
                    "my-1 w-0.5 flex-1",
                    travelled ? "bg-brand" : "border-l-2 border-dashed border-strong",
                  )}
                />
              )}
            </div>
            <div className={cn("flex min-w-0 flex-1 flex-col pb-5", last && "pb-0")}>
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={cn(
                    "text-base",
                    item.state === "upcoming" || item.state === "cancelled"
                      ? "text-fg-tertiary"
                      : item.state === "current" || item.state === "problem" || item.state === "blocked"
                        ? "font-semibold"
                        : "",
                    item.state === "problem" && "text-danger-text",
                    item.state === "blocked" && "text-warning-text",
                  )}
                >
                  {item.title}
                </span>
                {item.time && (
                  <span className="shrink-0 text-xs text-fg-tertiary tabular-nums">{item.time}</span>
                )}
              </div>
              {item.description && (
                <span className="text-sm text-fg-secondary">{item.description}</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
