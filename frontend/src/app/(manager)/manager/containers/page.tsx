"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { ErrorMessage } from "@/components/ui/error-message";
import { Field } from "@/components/ui/field";
import { QueryState } from "@/components/ui/query-state";
import { Section } from "@/components/ui/section";
import { api } from "@/lib/api/client";
import type { ContainerSummary, Paginated } from "@/lib/api/types";
import { decimal, label } from "@/lib/format";
import { useAction } from "@/lib/use-action";

export default function ContainersPage() {
  const containers = useQuery({
    queryKey: ["containers"],
    queryFn: () => api<Paginated<ContainerSummary>>("/containers?limit=100"),
  });

  return (
    <>
      <h1>Containers</h1>
      <QueryState query={containers}>
        {({ data }) => (
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Type</th>
                <th>Route</th>
                <th>Status</th>
                <th>CBM used</th>
                <th>Weight used</th>
                <th>Orders</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && (
                <tr>
                  <td colSpan={8}>No containers.</td>
                </tr>
              )}
              {data.map((container) => (
                <tr key={container.id}>
                  <td>{container.containerRef}</td>
                  <td>{container.containerType}</td>
                  <td>
                    {container.originPort} → {container.destinationPort} (
                    {label(container.routeType)})
                  </td>
                  <td>{label(container.status)}</td>
                  <td>
                    {decimal(container.utilization.allocatedCbm)} /{" "}
                    {decimal(container.capacityCbm)} (
                    {container.utilization.cbmPercent}%)
                  </td>
                  <td>
                    {decimal(container.utilization.allocatedWeightKg)} /{" "}
                    {decimal(container.capacityWeightKg)} kg (
                    {container.utilization.weightPercent}%)
                  </td>
                  <td>{container._count.allocations}</td>
                  <td>
                    <Link href={`/manager/containers/${container.id}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </QueryState>

      <Section title="Open a container">
        <NewContainer />
      </Section>
    </>
  );
}

function NewContainer() {
  const [form, setForm] = useState({
    containerRef: "",
    containerType: "40HC",
    capacityCbm: "68",
    capacityWeightKg: "26000",
    originPort: "",
    destinationPort: "",
    routeType: "DIRECT",
  });

  const set =
    (field: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));

  const create = useAction(() =>
    api("/containers", {
      method: "POST",
      body: {
        ...form,
        capacityCbm: Number(form.capacityCbm),
        capacityWeightKg: Number(form.capacityWeightKg),
      },
    }).then(() => setForm((current) => ({ ...current, containerRef: "" }))),
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate();
      }}
    >
      <Field label="Reference">
        <input required value={form.containerRef} onChange={set("containerRef")} />
      </Field>
      <Field label="Type">
        <input required value={form.containerType} onChange={set("containerType")} />
      </Field>
      <Field label="Capacity (CBM)">
        <input
          type="number"
          step="0.001"
          min="0.001"
          required
          value={form.capacityCbm}
          onChange={set("capacityCbm")}
        />
      </Field>
      <Field label="Capacity (kg)">
        <input
          type="number"
          step="0.001"
          min="0.001"
          required
          value={form.capacityWeightKg}
          onChange={set("capacityWeightKg")}
        />
      </Field>
      <Field label="Origin port">
        <input required value={form.originPort} onChange={set("originPort")} />
      </Field>
      <Field label="Destination port">
        <input
          required
          value={form.destinationPort}
          onChange={set("destinationPort")}
        />
      </Field>
      <Field label="Route">
        <select value={form.routeType} onChange={set("routeType")}>
          <option value="DIRECT">Direct</option>
          <option value="TRANSIT">Via transit stop</option>
        </select>
      </Field>
      <button type="submit" disabled={create.isPending}>
        Open container
      </button>
      <ErrorMessage error={create.error} />
    </form>
  );
}
