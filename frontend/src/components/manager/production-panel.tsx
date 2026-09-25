"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ErrorMessage } from "@/components/ui/error-message";
import { Field } from "@/components/ui/field";
import { api } from "@/lib/api/client";
import type {
  Order,
  Paginated,
  ProductionOrder,
  ProductionOrderStatus,
  QcOutcome,
  Supplier,
} from "@/lib/api/types";
import { date, label, money } from "@/lib/format";
import { PRODUCTION_NEXT } from "@/lib/lifecycles";
import { useAction } from "@/lib/use-action";

/** Factory batches for the order, their QC inspections, and sign-off. */
export function ProductionPanel({ order }: { order: Order }) {
  return (
    <>
      {order.productionOrders.length === 0 ? (
        <p>No production orders yet.</p>
      ) : (
        order.productionOrders.map((batch) => (
          <ProductionBatch key={batch.id} batch={batch} />
        ))
      )}
      <NewProductionOrder order={order} />
    </>
  );
}

function ProductionBatch({ batch }: { batch: ProductionOrder }) {
  const move = useAction((status: ProductionOrderStatus) =>
    api(`/production-orders/${batch.id}/status`, {
      method: "POST",
      body: { status },
    }),
  );

  const signOff = useAction((inspectionId: string) =>
    api(`/qc-inspections/${inspectionId}/sign-off`, {
      method: "PATCH",
      body: {},
    }),
  );

  const inspectable = batch.status === "READY" || batch.status === "RECEIVED";

  return (
    <fieldset>
      <legend>
        {batch.supplier.name} — {money(batch.agreedCost, batch.currency)} —{" "}
        {label(batch.status)}
      </legend>

      <p>
        {PRODUCTION_NEXT[batch.status].map((status) => (
          <button
            key={status}
            type="button"
            disabled={move.isPending}
            onClick={() => move.mutate(status)}
          >
            Mark {label(status)}
          </button>
        ))}
      </p>
      <ErrorMessage error={move.error} />

      <h4>QC inspections</h4>
      {batch.inspections.length === 0 ? (
        <p>None recorded.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Inspected</th>
              <th>Outcome</th>
              <th>Notes</th>
              <th>Client sign-off</th>
            </tr>
          </thead>
          <tbody>
            {batch.inspections.map((inspection) => (
              <tr key={inspection.id}>
                <td>{date(inspection.inspectedAt)}</td>
                <td>{label(inspection.outcome)}</td>
                <td>{inspection.rejectionNotes ?? ""}</td>
                <td>
                  {inspection.clientSignedOffAt ? (
                    `Signed ${date(inspection.clientSignedOffAt)}`
                  ) : inspection.outcome === "REJECTED" ? (
                    "Cannot be signed (rejected)"
                  ) : (
                    <button
                      type="button"
                      disabled={signOff.isPending}
                      onClick={() => signOff.mutate(inspection.id)}
                    >
                      Record client sign-off
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ErrorMessage error={signOff.error} />

      {inspectable ? (
        <NewInspection productionOrderId={batch.id} />
      ) : (
        <p>Inspections can be recorded once the batch is ready.</p>
      )}
    </fieldset>
  );
}

function NewInspection({ productionOrderId }: { productionOrderId: string }) {
  const [outcome, setOutcome] = useState<QcOutcome>("PASSED");
  const [notes, setNotes] = useState("");

  const record = useAction(() =>
    api("/qc-inspections", {
      method: "POST",
      body: {
        productionOrderId,
        inspectedAt: new Date().toISOString(),
        outcome,
        ...(notes.trim() ? { rejectionNotes: notes.trim() } : {}),
      },
    }).then(() => setNotes("")),
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        record.mutate();
      }}
    >
      <Field label="Outcome">
        <select
          value={outcome}
          onChange={(event) => setOutcome(event.target.value as QcOutcome)}
        >
          <option value="PASSED">Passed</option>
          <option value="PARTIAL">Partial</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </Field>
      <Field label="Notes (required if rejected)">
        <input value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>
      <button type="submit" disabled={record.isPending}>
        Record inspection
      </button>
      <ErrorMessage error={record.error} />
    </form>
  );
}

function NewProductionOrder({ order }: { order: Order }) {
  const [supplierId, setSupplierId] = useState("");
  const [agreedCost, setAgreedCost] = useState("");
  const [currency, setCurrency] = useState(order.currency);

  const suppliers = useQuery({
    queryKey: ["suppliers", "all"],
    queryFn: () => api<Paginated<Supplier>>("/suppliers?limit=100"),
  });

  const create = useAction(() =>
    api("/production-orders", {
      method: "POST",
      body: {
        orderId: order.id,
        supplierId,
        agreedCost: Number(agreedCost),
        currency,
      },
    }).then(() => setAgreedCost("")),
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate();
      }}
    >
      <h4>New production order</h4>
      <Field label="Supplier">
        <select
          required
          value={supplierId}
          onChange={(event) => setSupplierId(event.target.value)}
        >
          <option value="">Choose a supplier…</option>
          {suppliers.data?.data.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name} ({supplier.country})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Agreed cost">
        <input
          type="number"
          step="0.01"
          min="0.01"
          required
          value={agreedCost}
          onChange={(event) => setAgreedCost(event.target.value)}
        />
      </Field>
      <Field label="Currency">
        <input
          required
          maxLength={3}
          size={4}
          value={currency}
          onChange={(event) => setCurrency(event.target.value.toUpperCase())}
        />
      </Field>
      <button type="submit" disabled={create.isPending}>
        Place production order
      </button>
      <ErrorMessage error={create.error} />
    </form>
  );
}
