"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { DocumentsPanel } from "@/components/manager/documents-panel";
import { HistoryTable } from "@/components/orders/status-timeline";
import { ErrorMessage } from "@/components/ui/error-message";
import { Field } from "@/components/ui/field";
import { QueryState } from "@/components/ui/query-state";
import { Section } from "@/components/ui/section";
import { api } from "@/lib/api/client";
import type {
  Container,
  ContainerStatus,
  OrderSummary,
  Paginated,
  StatusChange,
} from "@/lib/api/types";
import { dateTime, decimal, label } from "@/lib/format";
import { CONTAINER_NEXT } from "@/lib/lifecycles";
import { useAction } from "@/lib/use-action";

export default function ContainerPage() {
  const { id } = useParams<{ id: string }>();

  const container = useQuery({
    queryKey: ["container", id],
    queryFn: () => api<Container>(`/containers/${id}`),
  });

  const history = useQuery({
    queryKey: ["container-history", id],
    queryFn: () => api<StatusChange[]>(`/containers/${id}/status-history`),
  });

  return (
    <QueryState query={container}>
      {(container) => (
        <>
          <p>
            <Link href="/manager/containers">Back to containers</Link>
          </p>
          <h1>
            {container.containerRef} — {label(container.status)}
          </h1>
          <p>
            {container.containerType}, {container.originPort} →{" "}
            {container.destinationPort} ({label(container.routeType)})
          </p>

          <Section title="Capacity">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Capacity</th>
                  <th>Allocated</th>
                  <th>Remaining</th>
                  <th>Used</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>CBM</th>
                  <td>{decimal(container.capacityCbm)}</td>
                  <td>{decimal(container.utilization.allocatedCbm)}</td>
                  <td>{decimal(container.utilization.remainingCbm)}</td>
                  <td>
                    <progress max={100} value={container.utilization.cbmPercent} />{" "}
                    {container.utilization.cbmPercent}%
                  </td>
                </tr>
                <tr>
                  <th>Weight (kg)</th>
                  <td>{decimal(container.capacityWeightKg)}</td>
                  <td>{decimal(container.utilization.allocatedWeightKg)}</td>
                  <td>{decimal(container.utilization.remainingWeightKg)}</td>
                  <td>
                    <progress
                      max={100}
                      value={container.utilization.weightPercent}
                    />{" "}
                    {container.utilization.weightPercent}%
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Section title="Status">
            <ContainerStatusActions container={container} />
          </Section>

          <Section title="Allocated orders">
            <Allocations container={container} />
          </Section>

          {container.routeType === "TRANSIT" && (
            <Section title="Transit legs">
              <TransitLegs container={container} />
            </Section>
          )}

          <Section title="Container documents">
            <DocumentsPanel containerId={container.id} />
          </Section>

          <Section title="Status history">
            {history.data && <HistoryTable history={history.data} />}
          </Section>
        </>
      )}
    </QueryState>
  );
}

function ContainerStatusActions({ container }: { container: Container }) {
  const move = useAction((status: ContainerStatus) =>
    api(`/containers/${container.id}/status`, {
      method: "POST",
      body: { status },
    }),
  );

  const next = CONTAINER_NEXT[container.status];

  return (
    <>
      {next.length === 0 ? (
        <p>Closed. No further moves.</p>
      ) : (
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
      )}
      <ErrorMessage error={move.error} />
    </>
  );
}

function Allocations({ container }: { container: Container }) {
  const [orderId, setOrderId] = useState("");
  const open = container.status === "OPEN_FOR_ALLOCATION";

  const orders = useQuery({
    queryKey: ["orders", "allocatable"],
    queryFn: () =>
      api<Paginated<OrderSummary>>("/orders?status=SHIPMENT_BOOKING&limit=100"),
    enabled: open,
  });

  const allocate = useAction(() =>
    api(`/containers/${container.id}/allocations`, {
      method: "POST",
      body: { orderId },
    }).then(() => setOrderId("")),
  );

  const remove = useAction((allocationId: string) =>
    api(`/containers/${container.id}/allocations/${allocationId}`, {
      method: "DELETE",
    }),
  );

  return (
    <>
      {container.allocations.length === 0 ? (
        <p>Nothing allocated yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Order status</th>
              <th>CBM</th>
              <th>Weight (kg)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {container.allocations.map((allocation) => (
              <tr key={allocation.id}>
                <td>
                  <Link href={`/manager/orders/${allocation.order.id}`}>
                    {allocation.order.client.companyName}
                  </Link>
                </td>
                <td>{label(allocation.order.status)}</td>
                <td>{decimal(allocation.allocatedCbm)}</td>
                <td>{decimal(allocation.allocatedWeightKg)}</td>
                <td>
                  {open && (
                    <button
                      type="button"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(allocation.id)}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ErrorMessage error={remove.error} />

      {open ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            allocate.mutate();
          }}
        >
          <Field label="Allocate an order awaiting shipment (its full volume and weight)">
            <select
              required
              value={orderId}
              onChange={(event) => setOrderId(event.target.value)}
            >
              <option value="">Choose an order…</option>
              {orders.data?.data.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.client.companyName} — {order.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </Field>
          <button type="submit" disabled={allocate.isPending}>
            Allocate
          </button>
          <ErrorMessage error={allocate.error} />
        </form>
      ) : (
        <p>Allocations are locked once the container is booked.</p>
      )}
    </>
  );
}

function TransitLegs({ container }: { container: Container }) {
  const [port, setPort] = useState("");

  const add = useAction(() =>
    api(`/containers/${container.id}/transit-legs`, {
      method: "POST",
      body: { port },
    }).then(() => setPort("")),
  );

  const record = useAction(
    ({ legId, event }: { legId: string; event: "arrival" | "departure" }) =>
      api(`/containers/${container.id}/transit-legs/${legId}/${event}`, {
        method: "POST",
        body: {},
      }),
  );

  return (
    <>
      {container.transitLegs.length === 0 ? (
        <p>No transit stops planned.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Port</th>
              <th>Arrived</th>
              <th>Departed</th>
            </tr>
          </thead>
          <tbody>
            {container.transitLegs.map((leg) => (
              <tr key={leg.id}>
                <td>{leg.sequence}</td>
                <td>{leg.port}</td>
                <td>
                  {leg.arrivedAt ? (
                    dateTime(leg.arrivedAt)
                  ) : (
                    <button
                      type="button"
                      disabled={record.isPending}
                      onClick={() =>
                        record.mutate({ legId: leg.id, event: "arrival" })
                      }
                    >
                      Record arrival
                    </button>
                  )}
                </td>
                <td>
                  {leg.departedAt ? (
                    dateTime(leg.departedAt)
                  ) : (
                    <button
                      type="button"
                      disabled={record.isPending}
                      onClick={() =>
                        record.mutate({ legId: leg.id, event: "departure" })
                      }
                    >
                      Record departure
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ErrorMessage error={record.error} />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          add.mutate();
        }}
      >
        <Field label="Add a transit stop">
          <input
            required
            placeholder="Port"
            value={port}
            onChange={(event) => setPort(event.target.value)}
          />
        </Field>
        <button type="submit" disabled={add.isPending}>
          Add stop
        </button>
        <ErrorMessage error={add.error} />
      </form>
    </>
  );
}
