import { CheckIcon, LockIcon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type StepState =
  | "done"
  | "current"
  | "final"
  | "upcoming"
  | "problem"
  | "blocked"
  | "cancelled";

export interface Step {
  label: string;
  /** Already formatted, e.g. "14 Sep". */
  date?: string;
  state: StepState;
}

const NODE: Record<StepState, string> = {
  done: "border-[1.5px] border-brand bg-brand text-on-brand",
  final: "border-[1.5px] border-success-solid bg-success-solid text-on-success",
  current: "border-2 border-brand bg-surface shadow-[0_0_0_4px_var(--accent-soft)]",
  upcoming: "border-[1.5px] border-strong bg-surface",
  problem: "border-[1.5px] border-danger-solid bg-danger-solid text-on-danger",
  blocked: "border-[1.5px] border-warning-solid bg-warning-solid text-on-warning",
  cancelled: "border-[1.5px] border-strong bg-subtle text-fg-tertiary",
};

const LABEL: Record<StepState, string> = {
  done: "text-fg",
  final: "font-semibold text-fg",
  current: "font-semibold text-fg",
  upcoming: "text-fg-tertiary",
  problem: "font-semibold text-danger-text",
  blocked: "font-semibold text-warning-text",
  cancelled: "text-fg-tertiary",
};

function NodeGlyph({ state }: { state: StepState }) {
  if (state === "done" || state === "final") return <CheckIcon className="size-3" strokeWidth={3} />;
  if (state === "problem" || state === "cancelled") return <XIcon className="size-3" strokeWidth={3} />;
  if (state === "blocked") return <LockIcon className="size-3" strokeWidth={2.5} />;
  if (state === "current") return <span className="size-2 rounded-full bg-brand" />;
  return null;
}

/** A line between two nodes: solid brand once travelled, dashed ahead. */
function Connector({ travelled, hidden }: { travelled: boolean; hidden: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "h-0.5 flex-1 transition-colors duration-[260ms]",
        hidden ? "invisible" : travelled ? "bg-brand" : "border-t-2 border-dashed border-strong",
      )}
    />
  );
}

/**
 * The journey as a horizontal track. Each step shows the date it was
 * reached. Scrolls sideways on narrow screens rather than squashing labels.
 */
export function Stepper({ steps, minStepWidth = 64 }: { steps: Step[]; minStepWidth?: number }) {
  const reached = (state: StepState) => state !== "upcoming";

  return (
    <div className="overflow-x-auto pb-1">
      <ol
        className="m-0 flex list-none p-0"
        style={{ minWidth: steps.length * minStepWidth }}
      >
        {steps.map((step, index) => (
          <li
            key={`${step.label}-${index}`}
            aria-current={step.state === "current" ? "step" : undefined}
            className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center"
          >
            <div className="flex w-full items-center">
              <Connector travelled={reached(step.state)} hidden={index === 0} />
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full transition-colors duration-[260ms]",
                  NODE[step.state],
                )}
              >
                <NodeGlyph state={step.state} />
              </span>
              <Connector
                travelled={index < steps.length - 1 && reached(steps[index + 1].state)}
                hidden={index === steps.length - 1}
              />
            </div>
            <span className={cn("px-1 text-xs text-balance", LABEL[step.state])}>{step.label}</span>
            <span className="min-h-4 text-xs text-fg-tertiary tabular-nums">{step.date}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
