import { ShieldCheckIcon } from "lucide-react";

import { Card, CardFooter } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Container } from "@/lib/api/types";
import { decimal } from "@/lib/format";
import { cn } from "@/lib/utils";

/** One colour per allocated order, in allocation order. */
export const SERIES = [
  "bg-series-1",
  "bg-series-2",
  "bg-series-3",
  "bg-series-4",
  "bg-series-5",
  "bg-series-6",
];

function CapacityBlock({
  container,
  title,
  unit,
  capacity,
  allocated,
  remaining,
  percent,
  share,
  digits,
}: {
  container: Container;
  title: string;
  unit: string;
  capacity: string;
  allocated: string;
  remaining: string;
  percent: number;
  share: (allocation: Container["allocations"][number]) => string;
  digits: number;
}) {
  const fmt = (value: string) => decimal(value, digits);

  return (
    <div className="flex flex-col gap-3 border-b border-divider px-5 py-4 md:border-r md:last:border-r-0">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-lg font-semibold">{title}</h2>
        <span className="text-2xl leading-none font-semibold tabular-nums">{percent}%</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {(
          [
            ["Capacity", capacity, false],
            ["Allocated", allocated, false],
            ["Remaining", remaining, true],
          ] as const
        ).map(([label, value, strong]) => (
          <div key={label}>
            <div className="text-xs text-fg-secondary">{label}</div>
            <div
              className={cn(
                "text-lg tabular-nums",
                strong ? "font-semibold" : "font-medium",
                strong && percent >= 95 && "text-warning-text",
              )}
            >
              {fmt(value)} <span className="text-xs font-normal text-fg-tertiary">{unit}</span>
            </div>
          </div>
        ))}
      </div>
      <div
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="flex h-4 gap-px overflow-hidden rounded-sm bg-sunken"
      >
        {container.allocations.map((allocation, index) => (
          <Tooltip key={allocation.id}>
            <TooltipTrigger asChild>
              <div
                className={cn("h-full transition-[width] duration-[260ms] ease-standard", SERIES[index % SERIES.length])}
                style={{ width: `${(100 * Number(share(allocation))) / Number(capacity)}%` }}
              />
            </TooltipTrigger>
            <TooltipContent>
              {allocation.order.client.companyName} · {fmt(share(allocation))} {unit}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-fg-secondary">
        {container.allocations.map((allocation, index) => (
          <span key={allocation.id} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2 rounded-[2px]", SERIES[index % SERIES.length])} />
            {allocation.order.client.companyName}
            <span className="text-fg tabular-nums">{fmt(share(allocation))}</span>
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-[2px] border border-strong bg-sunken" />
          Free <span className="text-fg tabular-nums">{fmt(remaining)}</span>
        </span>
      </div>
    </div>
  );
}

/** Volume and weight side by side, each split by the client filling it. */
export function CapacityCard({ container }: { container: Container }) {
  const { utilization } = container;

  return (
    <Card aria-label="Capacity">
      <div className="grid md:grid-cols-2">
        <CapacityBlock
          container={container}
          title="Volume"
          unit="CBM"
          digits={2}
          capacity={container.capacityCbm}
          allocated={utilization.allocatedCbm}
          remaining={utilization.remainingCbm}
          percent={utilization.cbmPercent}
          share={(allocation) => allocation.allocatedCbm}
        />
        <CapacityBlock
          container={container}
          title="Weight"
          unit="kg"
          digits={0}
          capacity={container.capacityWeightKg}
          allocated={utilization.allocatedWeightKg}
          remaining={utilization.remainingWeightKg}
          percent={utilization.weightPercent}
          share={(allocation) => allocation.allocatedWeightKg}
        />
      </div>
      <CardFooter className="items-start gap-2 border-t-0 px-5 py-2.5 text-xs text-fg-secondary">
        <ShieldCheckIcon className="size-3.5 shrink-0 text-brand" aria-hidden />
        <span>
          Capacity guard: any allocation that would take this box past{" "}
          {decimal(container.capacityCbm, 2)} CBM or {decimal(container.capacityWeightKg, 0)} kg is
          refused.
        </span>
      </CardFooter>
    </Card>
  );
}
