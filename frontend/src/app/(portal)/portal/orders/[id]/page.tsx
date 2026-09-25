"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";

import { DocumentTable } from "@/components/documents/document-table";
import { SettlementSummary } from "@/components/orders/settlement-summary";
import { StatusTimeline } from "@/components/orders/status-timeline";
import { QueryState } from "@/components/ui/query-state";
import { Section } from "@/components/ui/section";
import { api } from "@/lib/api/client";
import type {
  CargoDocument,
  Order,
  Paginated,
  Payment,
  StatusChange,
} from "@/lib/api/types";
import { date, decimal, label, money } from "@/lib/format";

/** Read-only: where the shipment is, what is owed, and the documents. */
export default function PortalOrderPage() {
  const { id } = useParams<{ id: string }>();

  const order = useQuery({
    queryKey: ["order", id],
    queryFn: () => api<Order>(`/orders/${id}`),
  });
  const history = useQuery({
    queryKey: ["order-history", id],
    queryFn: () => api<StatusChange[]>(`/orders/${id}/status-history`),
  });
  const documents = useQuery({
    queryKey: ["documents", `orderId=${id}`],
    queryFn: () =>
      api<Paginated<CargoDocument>>(`/documents?orderId=${id}&limit=100`),
  });
  const payments = useQuery({
    queryKey: ["payments", id],
    queryFn: () => api<Paginated<Payment>>(`/payments?orderId=${id}&limit=100`),
  });

  return (
    <QueryState query={order}>
      {(order) => (
        <>
          <p>
            <Link href="/portal">Back to my orders</Link>
          </p>
          <h1>Order placed {date(order.placedAt)}</h1>
          <p>
            {money(order.agreedPrice, order.currency)} —{" "}
            {decimal(order.totalCbm)} CBM, {decimal(order.totalWeightKg)} kg
          </p>

          <Section title="Shipment status">
            {history.data && (
              <StatusTimeline status={order.status} history={history.data} />
            )}
          </Section>

          <Section title="Documents">
            {!order.settlement.paidInFull && (
              <p>
                Your shipping documents are released as soon as the balance of{" "}
                {money(order.settlement.balanceDue, order.currency)} is paid.
              </p>
            )}
            <QueryState query={documents}>
              {({ data }) => <DocumentTable documents={data} viewer="CLIENT" />}
            </QueryState>
          </Section>

          <Section title="Payments">
            <SettlementSummary settlement={order.settlement} />
            <QueryState query={payments}>
              {({ data }) =>
                data.length === 0 ? (
                  <p>No payments recorded.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((payment) => (
                        <tr key={payment.id}>
                          <td>{label(payment.paymentType)}</td>
                          <td>{money(payment.amount, payment.currency)}</td>
                          <td>
                            {payment.paidAt ? date(payment.paidAt) : "Awaiting payment"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              }
            </QueryState>
          </Section>

          <Section title="Items">
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Quantity</th>
                  <th>Unit price</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.description}</td>
                    <td>{item.quantity}</td>
                    <td>{money(item.unitPrice, order.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </>
      )}
    </QueryState>
  );
}
