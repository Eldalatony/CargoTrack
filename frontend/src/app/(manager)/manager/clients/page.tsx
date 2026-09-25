"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ErrorMessage } from "@/components/ui/error-message";
import { Field } from "@/components/ui/field";
import { QueryState } from "@/components/ui/query-state";
import { Section } from "@/components/ui/section";
import { api } from "@/lib/api/client";
import type { Client, Paginated } from "@/lib/api/types";
import { useAction } from "@/lib/use-action";

export default function ClientsPage() {
  const clients = useQuery({
    queryKey: ["clients", "all"],
    queryFn: () => api<Paginated<Client>>("/clients?limit=100"),
  });

  return (
    <>
      <h1>Clients</h1>
      <QueryState query={clients}>
        {({ data }) => (
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Contact</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Country</th>
              </tr>
            </thead>
            <tbody>
              {data.map((client) => (
                <tr key={client.id}>
                  <td>{client.companyName}</td>
                  <td>{client.contactName}</td>
                  <td>{client.email}</td>
                  <td>{client.phone ?? ""}</td>
                  <td>{client.country}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </QueryState>

      <Section title="Add a client">
        <NewClient />
      </Section>

      <Section title="Give a client a portal login">
        <NewClientLogin clients={clients.data?.data ?? []} />
      </Section>
    </>
  );
}

function NewClient() {
  const empty = { companyName: "", contactName: "", email: "", phone: "", country: "" };
  const [form, setForm] = useState(empty);

  const set =
    (field: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));

  const create = useAction(() =>
    api("/clients", {
      method: "POST",
      body: {
        companyName: form.companyName,
        contactName: form.contactName,
        email: form.email,
        country: form.country,
        ...(form.phone ? { phone: form.phone } : {}),
      },
    }).then(() => setForm(empty)),
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate();
      }}
    >
      <Field label="Company">
        <input required value={form.companyName} onChange={set("companyName")} />
      </Field>
      <Field label="Contact name">
        <input required value={form.contactName} onChange={set("contactName")} />
      </Field>
      <Field label="Email">
        <input type="email" required value={form.email} onChange={set("email")} />
      </Field>
      <Field label="Phone">
        <input value={form.phone} onChange={set("phone")} />
      </Field>
      <Field label="Country">
        <input required value={form.country} onChange={set("country")} />
      </Field>
      <button type="submit" disabled={create.isPending}>
        Add client
      </button>
      <ErrorMessage error={create.error} />
    </form>
  );
}

function NewClientLogin({ clients }: { clients: Client[] }) {
  const empty = { clientId: "", name: "", email: "", password: "" };
  const [form, setForm] = useState(empty);

  const set =
    (field: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));

  const create = useAction(() =>
    api("/users", {
      method: "POST",
      body: { ...form, role: "CLIENT" },
    }).then(() => setForm(empty)),
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate();
      }}
    >
      <Field label="Client">
        <select required value={form.clientId} onChange={set("clientId")}>
          <option value="">Choose a client…</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.companyName}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Name">
        <input required value={form.name} onChange={set("name")} />
      </Field>
      <Field label="Login email">
        <input type="email" required value={form.email} onChange={set("email")} />
      </Field>
      <Field label="Password">
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={form.password}
          onChange={set("password")}
        />
      </Field>
      <button type="submit" disabled={create.isPending}>
        Create login
      </button>
      {create.isSuccess && <p>Login created.</p>}
      <ErrorMessage error={create.error} />
    </form>
  );
}
