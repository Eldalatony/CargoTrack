"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ErrorMessage } from "@/components/ui/error-message";
import { Field } from "@/components/ui/field";
import { QueryState } from "@/components/ui/query-state";
import { Section } from "@/components/ui/section";
import { api } from "@/lib/api/client";
import type { Paginated, Supplier } from "@/lib/api/types";
import { useAction } from "@/lib/use-action";

export default function SuppliersPage() {
  const suppliers = useQuery({
    queryKey: ["suppliers", "all"],
    queryFn: () => api<Paginated<Supplier>>("/suppliers?limit=100"),
  });

  const [name, setName] = useState("");
  const [country, setCountry] = useState("");

  const create = useAction(() =>
    api("/suppliers", { method: "POST", body: { name, country } }).then(() => {
      setName("");
      setCountry("");
    }),
  );

  return (
    <>
      <h1>Suppliers</h1>
      <QueryState query={suppliers}>
        {({ data }) => (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Country</th>
              </tr>
            </thead>
            <tbody>
              {data.map((supplier) => (
                <tr key={supplier.id}>
                  <td>{supplier.name}</td>
                  <td>{supplier.country}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </QueryState>

      <Section title="Add a supplier">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <Field label="Name">
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Country">
            <input
              required
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            />
          </Field>
          <button type="submit" disabled={create.isPending}>
            Add supplier
          </button>
          <ErrorMessage error={create.error} />
        </form>
      </Section>
    </>
  );
}
