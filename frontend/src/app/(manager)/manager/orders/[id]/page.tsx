"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";

import { DocumentsPanel } from "@/components/manager/documents-panel";
import { OrderStatusActions } from "@/components/manager/order-status-actions";
import { PaymentsPanel } from "@/components/manager/payments-panel";
import { ProductionPanel } from "@/components/manager/production-panel";
import { SettlementSummary } from "@/components/orders/settlement-summary";
import {
  HistoryTable,
  StatusTimeline,
} from "@/components/orders/status-timeline";
import { QueryState } from "@/components/ui/query-state";
import { Section } from "@/components/ui/section";
import { api } from "@/lib/api/client";
import type { Order, StatusChange } from "@/lib/api/types";
import { date, decimal, label, money } from "@/lib/format";

/**
 * Everything the office does to one order, top to bottom in the order it
 * happens: status, production and QC, money, documents, history.
 */
export default function ManagerOrderPage() {
  const { id } = useParams<{ id: string }>();

  const order = useQuery({
    queryKey: ["order", id],
    queryFn: () => api<Order>(`/orders/${id}`),
  });

  const history = useQuery({
    queryKey: ["order-history", id],
    queryFn: () => api<StatusChange[]>(`/orders/${id}/status-history`),
  });

  return (
    <QueryState query={order}>
      {(order) => (
        <>
          <p>
            <Link href="/manager">Back to orders</Link>
          </p>
          <h1>
            Order for {order.client.companyName} — {label(order.status)}
          </h1>
          <table>
            <tbody>
              <tr>
                <th>Order id</th>
                <td>{order.id}</td>
              </tr>
              <tr>
                <th>Placed</th>
                <td>{date(order.placedAt)}</td>
              </tr>
              <tr>
                <th>Required by</th>
                <td>{date(order.requiredBy)}</td>
              </tr>
              <tr>
                <th>Agreed price</th>
                <td>
                  {money(order.agreedPrice, order.currency)} (deposit{" "}
                  {decimal(order.depositPercentage, 2)}%)
                </td>
              </tr>
              <tr>
                <th>Volume / weight</th>
                <td>
                  {decimal(order.totalCbm)} CBM / {decimal(order.totalWeightKg)}{" "}
                  kg
                </td>
              </tr>
              <tr>
                <th>Closed</th>
                <td>{date(order.closedAt)}</td>
              </tr>
            </tbody>
          </table>

          <Section title="Status">
            {history.data && (
              <StatusTimeline status={order.status} history={history.data} />
            )}
            <OrderStatusActions order={order} />
          </Section>

          <Section title="Items">
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Quantity</th>
                  <th>Unit CBM</th>
                  <th>Unit weight (kg)</th>
                  <th>Unit price</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.description}</td>
                    <td>{item.quantity}</td>
                    <td>{decimal(item.unitCbm, 4)}</td>
                    <td>{decimal(item.unitWeightKg)}</td>
                    <td>{money(item.unitPrice, order.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="Production and QC">
            <ProductionPanel order={order} />
          </Section>

          <Section title="Payments">
            <SettlementSummary settlement={order.settlement} />
            <PaymentsPanel order={order} />
          </Section>

          <Section title="Documents">
            <DocumentsPanel orderId={order.id} />
          </Section>

          <Section title="Status history">
            {history.data && <HistoryTable history={history.data} />}
          </Section>
        </>
      )}
    </QueryState>
  );
}
