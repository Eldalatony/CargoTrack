import { queryOptions } from "@tanstack/react-query";

import { api } from "./client";
import type {
  CargoDocument,
  Client,
  Container,
  ContainerSummary,
  Notification,
  NotificationStatus,
  Order,
  OrderStatus,
  OrderSummary,
  Paginated,
  Payment,
  StatusChange,
  Supplier,
} from "./types";

/**
 * Every read the app makes, as TanStack Query option factories. Pages call
 * `useQuery(orders.detail(id))`, so a key and its fetcher can never drift
 * apart, and two screens asking for the same thing share one cache entry.
 */

function search(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  }
  return query.toString();
}

export const orders = {
  list: (params: { page?: number; limit?: number; status?: OrderStatus | "" }) =>
    queryOptions({
      queryKey: ["orders", params],
      queryFn: () =>
        api<Paginated<OrderSummary>>(`/orders?${search(params)}`),
    }),
  /** How many orders are in one status — the list's total, one row fetched. */
  count: (status: OrderStatus) =>
    queryOptions({
      queryKey: ["orders", "count", status],
      queryFn: () =>
        api<Paginated<OrderSummary>>(`/orders?${search({ status, limit: 1 })}`),
      select: (result) => result.meta.total,
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: ["order", id],
      queryFn: () => api<Order>(`/orders/${id}`),
    }),
  history: (id: string) =>
    queryOptions({
      queryKey: ["order-history", id],
      queryFn: () => api<StatusChange[]>(`/orders/${id}/status-history`),
    }),
};

export const containers = {
  list: () =>
    queryOptions({
      queryKey: ["containers"],
      queryFn: () => api<Paginated<ContainerSummary>>("/containers?limit=100"),
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: ["container", id],
      queryFn: () => api<Container>(`/containers/${id}`),
    }),
  history: (id: string) =>
    queryOptions({
      queryKey: ["container-history", id],
      queryFn: () => api<StatusChange[]>(`/containers/${id}/status-history`),
    }),
};

export const documents = {
  list: (filter: { orderId?: string; containerId?: string }) =>
    queryOptions({
      queryKey: ["documents", filter],
      queryFn: () =>
        api<Paginated<CargoDocument>>(
          `/documents?${search({ ...filter, limit: 100 })}`,
        ),
    }),
};

export const payments = {
  forOrder: (orderId: string) =>
    queryOptions({
      queryKey: ["payments", orderId],
      queryFn: () =>
        api<Paginated<Payment>>(`/payments?${search({ orderId, limit: 100 })}`),
    }),
};

export const notifications = {
  list: (params: {
    page?: number;
    limit?: number;
    status?: NotificationStatus | "";
  }) =>
    queryOptions({
      queryKey: ["notifications", params],
      queryFn: () =>
        api<Paginated<Notification>>(`/notifications?${search(params)}`),
    }),
  summary: () =>
    queryOptions({
      queryKey: ["notification-summary"],
      queryFn: () =>
        api<Record<NotificationStatus, number>>("/notifications/summary"),
    }),
};

export const clients = {
  all: () =>
    queryOptions({
      queryKey: ["clients", "all"],
      queryFn: () => api<Paginated<Client>>("/clients?limit=100"),
    }),
};

export const suppliers = {
  all: () =>
    queryOptions({
      queryKey: ["suppliers", "all"],
      queryFn: () => api<Paginated<Supplier>>("/suppliers?limit=100"),
    }),
};
