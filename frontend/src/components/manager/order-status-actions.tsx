"use client";

import { useState } from "react";

import { ErrorMessage } from "@/components/ui/error-message";
import { Field } from "@/components/ui/field";
import { api } from "@/lib/api/client";
import type { Order, OrderStatus } from "@/lib/api/types";
import { label } from "@/lib/format";
import { ORDER_EXCEPTIONS, ORDER_NEXT } from "@/lib/lifecycles";
import { useAction } from "@/lib/use-action";

/**
 * One button per move the state diagram allows from here. The server has the
 * final say: a refused move (deposit not cleared, balance unpaid, QC not
 * signed) comes back as an error under the buttons, naming the guard.
 */
export function OrderStatusActions({ order }: { order: Order }) {
  const next = ORDER_NEXT[order.status];
  const outstandingDeposit = Math.max(
    0,
    Number(order.settlement.depositRequired) -
      Number(order.settlement.depositReceived),
  );

  const [reason, setReason] = useState("");
  const [deposit, setDeposit] = useState(
    outstandingDeposit > 0 ? outstandingDeposit.toFixed(2) : "",
  );

  const move = useAction((to: OrderStatus) =>
    api(`/orders/${order.id}/status`, {
      method: "POST",
      body: {
        status: to,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        ...(to === "ORDER_CONFIRMED" && Number(deposit) > 0
          ? { deposit: { amount: Number(deposit) } }
          : {}),
      },
    }).then(() => setReason("")),
  );

  if (next.length === 0) {
    return <p>{label(order.status)} is final. No further moves.</p>;
  }

  return (
    <>
      {next.includes("ORDER_CONFIRMED") && (
        <Field
          label={`Deposit received with confirmation (${order.currency}, leave empty if not yet paid)`}
        >
          <input
            type="number"
            step="0.01"
            min="0"
            value={deposit}
            onChange={(event) => setDeposit(event.target.value)}
          />
        </Field>
      )}
      {next.some((status) => ORDER_EXCEPTIONS.includes(status)) && (
        <Field label="Reason (recorded in the history)">
          <input
            size={50}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      )}
      <p>
        {next.map((status) => (
          <button
            key={status}
            type="button"
            disabled={move.isPending}
            onClick={() => move.mutate(status)}
          >
            Move to {label(status)}
          </button>
        ))}
      </p>
      <ErrorMessage error={move.error} />
    </>
  );
}
