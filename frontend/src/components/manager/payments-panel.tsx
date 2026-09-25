"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ErrorMessage } from "@/components/ui/error-message";
import { Field } from "@/components/ui/field";
import { QueryState } from "@/components/ui/query-state";
import { api } from "@/lib/api/client";
import type { Order, Paginated, Payment, PaymentType } from "@/lib/api/types";
import { date, label, money } from "@/lib/format";
import { useAction } from "@/lib/use-action";

/**
 * Client money on the order. A row without a paid date is an invoice raised;
 * "Mark paid" records the money arriving. Paying the balance in full releases
 * the documents — and closes out an order in DOCUMENTS_WITHHELD by itself.
 */
export function PaymentsPanel({ order }: { order: Order }) {
  const payments = useQuery({
    queryKey: ["payments", order.id],
    queryFn: () =>
      api<Paginated<Payment>>(`/payments?orderId=${order.id}&limit=100`),
  });

  const markPaid = useAction((id: string) =>
    api(`/payments/${id}/paid`, { method: "POST", body: {} }),
  );
  const voidInvoice = useAction((id: string) =>
    api(`/payments/${id}`, { method: "DELETE" }),
  );

  return (
    <>
      <QueryState query={payments}>
        {({ data }) =>
          data.length === 0 ? (
            <p>No payments yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Direction</th>
                  <th>Amount</th>
                  <th>Reference</th>
                  <th>Raised</th>
                  <th>Paid</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.map((payment) => (
                  <tr key={payment.id}>
                    <td>{label(payment.paymentType)}</td>
                    <td>{label(payment.direction)}</td>
                    <td>{money(payment.amount, payment.currency)}</td>
                    <td>{payment.reference ?? ""}</td>
                    <td>{date(payment.createdAt)}</td>
                    <td>{payment.paidAt ? date(payment.paidAt) : "Outstanding"}</td>
                    <td>
                      {!payment.paidAt && (
                        <>
                          <button
                            type="button"
                            disabled={markPaid.isPending}
                            onClick={() => markPaid.mutate(payment.id)}
                          >
                            Mark paid
                          </button>{" "}
                          <button
                            type="button"
                            disabled={voidInvoice.isPending}
                            onClick={() => voidInvoice.mutate(payment.id)}
                          >
                            Void
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </QueryState>
      <ErrorMessage error={markPaid.error ?? voidInvoice.error} />
      <NewPayment order={order} />
    </>
  );
}

function NewPayment({ order }: { order: Order }) {
  const [paymentType, setPaymentType] = useState<PaymentType>("BALANCE");
  const [amount, setAmount] = useState("");
  const [received, setReceived] = useState(false);
  const [reference, setReference] = useState("");

  const suggested =
    paymentType === "BALANCE"
      ? order.settlement.balanceDue
      : paymentType === "DEPOSIT"
        ? String(
            Math.max(
              0,
              Number(order.settlement.depositRequired) -
                Number(order.settlement.depositReceived),
            ),
          )
        : "";

  const create = useAction(() =>
    api("/payments", {
      method: "POST",
      body: {
        orderId: order.id,
        paymentType,
        amount: Number(amount || suggested),
        currency: order.currency,
        ...(received ? { paidAt: new Date().toISOString() } : {}),
        ...(reference.trim() ? { reference: reference.trim() } : {}),
      },
    }).then(() => {
      setAmount("");
      setReference("");
    }),
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate();
      }}
    >
      <h4>Raise an invoice or record a payment</h4>
      <Field label="Type">
        <select
          value={paymentType}
          onChange={(event) => setPaymentType(event.target.value as PaymentType)}
        >
          <option value="DEPOSIT">Deposit</option>
          <option value="BALANCE">Balance</option>
          <option value="REFUND">Refund</option>
        </select>
      </Field>
      <Field label={`Amount (${order.currency})`}>
        <input
          type="number"
          step="0.01"
          min="0.01"
          placeholder={suggested}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </Field>
      <Field label="Reference">
        <input
          value={reference}
          onChange={(event) => setReference(event.target.value)}
        />
      </Field>
      <label>
        <input
          type="checkbox"
          checked={received}
          onChange={(event) => setReceived(event.target.checked)}
        />{" "}
        Money already received
      </label>
      <button type="submit" disabled={create.isPending}>
        {received ? "Record payment" : "Raise invoice"}
      </button>
      <ErrorMessage error={create.error} />
    </form>
  );
}
