"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import { OrderStatusBadge } from "@/components/common/status-badge";
import type { OrderSummary } from "@/lib/api/types";
import { amount, date } from "@/lib/format";
import { ORDER_HAPPY_PATH, ORDER_EXCEPTIONS } from "@/lib/lifecycles";

/** Journey position, so sorting by status follows the order's progress. */
const STATUS_RANK = [...ORDER_HAPPY_PATH, ...ORDER_EXCEPTIONS];

export const orderColumns: ColumnDef<OrderSummary, unknown>[] = [
  {
    id: "placed",
    accessorFn: (order) => order.placedAt,
    header: "Placed",
    cell: ({ row }) => (
      <span className="text-fg-secondary tabular-nums">{date(row.original.placedAt)}</span>
    ),
    meta: { headClassName: "w-[130px]" },
  },
  {
    id: "client",
    accessorFn: (order) => order.client.companyName,
    header: "Client",
    cell: ({ row }) => <span className="font-medium">{row.original.client.companyName}</span>,
  },
  {
    id: "status",
    accessorFn: (order) => STATUS_RANK.indexOf(order.status),
    header: "Status",
    cell: ({ row }) => <OrderStatusBadge status={row.original.status} size="sm" />,
  },
  {
    id: "price",
    accessorFn: (order) => Number(order.agreedPrice),
    header: "Agreed price",
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        {amount(row.original.agreedPrice)}{" "}
        <span className="text-fg-tertiary">{row.original.currency}</span>
      </span>
    ),
    meta: { align: "right" },
  },
  {
    id: "items",
    accessorFn: (order) => order._count.items,
    header: "Items",
    meta: { align: "right", headClassName: "w-[90px]" },
  },
  {
    id: "open",
    enableSorting: false,
    header: () => <span className="sr-only">Open</span>,
    cell: ({ row }) => (
      <Link
        href={`/manager/orders/${row.original.id}`}
        aria-label={`Open order for ${row.original.client.companyName}`}
        className="inline-flex items-center gap-0.5 text-sm font-medium"
      >
        Open
        <ChevronRightIcon className="size-3.5" />
      </Link>
    ),
    meta: { align: "right", headClassName: "w-[80px]" },
  },
];
