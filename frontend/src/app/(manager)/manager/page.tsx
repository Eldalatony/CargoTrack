"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Field } from "@/components/ui/field";
import { QueryState } from "@/components/ui/query-state";
import { api } from "@/lib/api/client";
import type {
  NotificationStatus,
  OrderStatus,
  OrderSummary,
  Paginated,
} from "@/lib/api/types";
import { date, label, money } from "@/lib/format";
import { ALL_ORDER_STATUSES } from "@/lib/lifecycles";

export default function OrdersDashboard() {
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [page, setPage] = useState(1);

  const orders = useQuery({
    queryKey: ["orders", status, page],
    queryFn: () =>
      api<Paginated<OrderSummary>>(
        `/orders?page=${page}&limit=25${status ? `&status=${status}` : ""}`,
      ),
  });

  const notifications = useQuery({
    queryKey: ["notification-summary"],
    queryFn: () =>
      api<Record<NotificationStatus, number>>("/notifications/summary"),
  });

  return (
    <>
      <h1>Orders</h1>

      {notifications.data && notifications.data.DEAD_LETTER > 0 && (
        <p role="alert">
          {notifications.data.DEAD_LETTER} notification(s) failed permanently.{" "}
          <Link href="/manager/notifications">Review failed notifications</Link>
        </p>
      )}

      <p>
        <Link href="/manager/orders/new">Place a new order</Link>
      </p>

      <Field label="Filter by status">
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as OrderStatus | "");
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {ALL_ORDER_STATUSES.map((value) => (
            <option key={value} value={value}>
              {label(value)}
            </option>
          ))}
        </select>
      </Field>

      <QueryState query={orders}>
        {({ data, meta }) => (
          <>
            <table>
              <thead>
                <tr>
                  <th>Placed</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Agreed price</th>
                  <th>Items</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 && (
                  <tr>
                    <td colSpan={6}>No orders.</td>
                  </tr>
                )}
                {data.map((order) => (
                  <tr key={order.id}>
                    <td>{date(order.placedAt)}</td>
                    <td>{order.client.companyName}</td>
                    <td>{label(order.status)}</td>
                    <td>{money(order.agreedPrice, order.currency)}</td>
                    <td>{order._count.items}</td>
                    <td>
                      <Link href={`/manager/orders/${order.id}`}>Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Page {meta.page} of {meta.totalPages} ({meta.total} orders){" "}
              <button
                type="button"
                disabled={meta.page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>{" "}
              <button
                type="button"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </p>
          </>
        )}
      </QueryState>
    </>
  );
}
