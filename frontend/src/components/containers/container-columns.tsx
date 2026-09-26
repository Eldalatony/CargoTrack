"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRightIcon, ChevronRightIcon, GitCommitHorizontalIcon } from "lucide-react";
import Link from "next/link";

import { ContainerStatusBadge } from "@/components/common/status-badge";
import { Progress } from "@/components/ui/progress";
import type { ContainerStatus, ContainerSummary } from "@/lib/api/types";
import { decimal } from "@/lib/format";

const FLOW: ContainerStatus[] = [
  "OPEN_FOR_ALLOCATION",
  "FULLY_ALLOCATED",
  "DEPARTED",
  "ARRIVED",
  "CLOSED",
];

/** "18.40 / 67.7 (27%)" over a 6px bar. */
function UsageCell({
  used,
  capacity,
  percent,
  unit,
  barClassName,
}: {
  used: string;
  capacity: string;
  percent: number;
  unit?: string;
  barClassName?: string;
}) {
  return (
    <div className="flex max-w-[150px] min-w-[110px] flex-col gap-1">
      <span className="flex flex-wrap gap-x-1 tabular-nums">
        <span>
          {decimal(used, 2)} / {decimal(capacity, 1)}
          {unit && ` ${unit}`}
        </span>
        <span className="text-fg-secondary">({percent}%)</span>
      </span>
      <Progress value={percent} aria-label={`${percent}% used`} indicatorClassName={barClassName} />
    </div>
  );
}

export const containerColumns: ColumnDef<ContainerSummary, unknown>[] = [
  {
    id: "ref",
    accessorFn: (container) => container.containerRef,
    header: "Reference",
    cell: ({ row }) => (
      <span className="font-mono whitespace-nowrap">{row.original.containerRef}</span>
    ),
  },
  {
    id: "type",
    accessorFn: (container) => container.containerType,
    header: "Type",
  },
  {
    id: "route",
    enableSorting: false,
    header: "Route",
    cell: ({ row }) => {
      const transit = row.original.routeType === "TRANSIT";
      return (
        <div>
          <div className="whitespace-nowrap">
            {row.original.originPort} → {row.original.destinationPort}
          </div>
          <div className="inline-flex items-center gap-1 text-xs text-fg-secondary">
            {transit ? (
              <GitCommitHorizontalIcon className="size-3" />
            ) : (
              <ArrowRightIcon className="size-3" />
            )}
            {transit ? "Via transit" : "Direct"}
          </div>
        </div>
      );
    },
  },
  {
    id: "status",
    accessorFn: (container) => FLOW.indexOf(container.status),
    header: "Status",
    cell: ({ row }) => <ContainerStatusBadge status={row.original.status} size="sm" />,
  },
  {
    id: "cbm",
    accessorFn: (container) => container.utilization.cbmPercent,
    header: "CBM used",
    cell: ({ row }) => (
      <UsageCell
        used={row.original.utilization.allocatedCbm}
        capacity={row.original.capacityCbm}
        percent={row.original.utilization.cbmPercent}
      />
    ),
  },
  {
    id: "kg",
    accessorFn: (container) => container.utilization.weightPercent,
    header: "Weight used",
    cell: ({ row }) => (
      <UsageCell
        used={row.original.utilization.allocatedWeightKg}
        capacity={row.original.capacityWeightKg}
        percent={row.original.utilization.weightPercent}
        unit="kg"
        barClassName="bg-weight-bar"
      />
    ),
  },
  {
    id: "orders",
    accessorFn: (container) => container._count.allocations,
    header: "Orders",
    meta: { align: "right" },
  },
  {
    id: "open",
    enableSorting: false,
    header: () => <span className="sr-only">Open</span>,
    cell: ({ row }) => (
      <Link
        href={`/manager/containers/${row.original.id}`}
        onClick={(event) => event.stopPropagation()}
        aria-label={`Open container ${row.original.containerRef}`}
        className="inline-flex items-center gap-0.5 text-sm font-medium"
      >
        Open
        <ChevronRightIcon className="size-3.5" />
      </Link>
    ),
    meta: { align: "right" },
  },
];
