"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { KeyRoundIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorMessage } from "@/components/common/error-message";
import { LoadingLines, QueryState } from "@/components/common/query-state";
import { Optional, Required, SectionCard } from "@/components/common/section-card";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Stagger, StaggerItem } from "@/components/motion";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api/client";
import { clients } from "@/lib/api/queries";
import type { Client } from "@/lib/api/types";
import { requiredText } from "@/lib/schemas";
import { useAction } from "@/lib/use-action";

export default function ClientsPage() {
  const list = useQuery(clients.all());

  return (
    <PageContainer>
      <PageHeader
        title="Clients"
        description="The importers you buy for. Give one a portal login so they can follow their shipments."
        actions={
          <Button asChild>
            <a href="#add-client">
              <UserPlusIcon />
              Add a client
            </a>
          </Button>
        }
      />

      <SectionCard title="All clients" flush>
        <QueryState query={list} loading={<LoadingLines rows={5} />}>
          {({ data }) =>
            data.length === 0 ? (
              <EmptyState
                icon={UsersIcon}
                title="No clients yet"
                description="Add the importers you work with, then place orders for them."
              />
            ) : (
              <Table style={{ minWidth: 720 }}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Country</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell className="font-medium">{client.companyName}</TableCell>
                      <TableCell>{client.contactName}</TableCell>
                      <TableCell>
                        <a href={`mailto:${client.email}`}>{client.email}</a>
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {client.phone ?? <span className="text-fg-tertiary">—</span>}
                      </TableCell>
                      <TableCell>{client.country}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          }
        </QueryState>
      </SectionCard>

      <Stagger className="grid items-start gap-5 lg:grid-cols-2">
        <StaggerItem>
          <NewClient />
        </StaggerItem>
        <StaggerItem>
          <NewClientLogin clients={list.data?.data ?? []} />
        </StaggerItem>
      </Stagger>
    </PageContainer>
  );
}

const clientSchema = z.object({
  companyName: requiredText("Enter the company name."),
  contactName: requiredText("Enter who you deal with."),
  email: z.email("Enter a valid email."),
  phone: z.string().trim(),
  country: requiredText("Enter the country."),
});

type ClientValues = z.infer<typeof clientSchema>;

const EMPTY_CLIENT: ClientValues = {
  companyName: "",
  contactName: "",
  email: "",
  phone: "",
  country: "Egypt",
};

function NewClient() {
  const form = useForm<ClientValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: EMPTY_CLIENT,
  });

  const create = useAction(
    ({ phone, ...values }: ClientValues) =>
      api("/clients", { method: "POST", body: { ...values, ...(phone ? { phone } : {}) } }),
    {
      success: (_, values) => `${values.companyName} added`,
      onDone: () => form.reset(EMPTY_CLIENT),
    },
  );

  const fields: { name: keyof ClientValues; label: string; type?: string; optional?: boolean }[] = [
    { name: "companyName", label: "Company" },
    { name: "contactName", label: "Contact name" },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Phone", type: "tel", optional: true },
    { name: "country", label: "Country" },
  ];

  return (
    <SectionCard id="add-client" title="Add a client">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) => create.mutate(values))}
          className="grid gap-4 sm:grid-cols-2"
          noValidate
        >
          {fields.map(({ name, label, type, optional }) => (
            <FormField
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <FormItem className={name === "companyName" ? "sm:col-span-2" : undefined}>
                  <FormLabel>
                    {label} {optional ? <Optional /> : <Required />}
                  </FormLabel>
                  <FormControl>
                    <Input type={type} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
          <ErrorMessage error={create.error} className="sm:col-span-2" />
          <div className="sm:col-span-2">
            <Button type="submit" disabled={create.isPending}>
              <UserPlusIcon />
              Add client
            </Button>
          </div>
        </form>
      </Form>
    </SectionCard>
  );
}

const loginSchema = z.object({
  clientId: requiredText("Choose the client."),
  name: requiredText("Enter the person’s name."),
  email: z.email("Enter a valid email."),
  password: z.string().min(8, "At least 8 characters."),
});

type LoginValues = z.infer<typeof loginSchema>;

const EMPTY_LOGIN: LoginValues = { clientId: "", name: "", email: "", password: "" };

function NewClientLogin({ clients: options }: { clients: Client[] }) {
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: EMPTY_LOGIN,
  });

  const create = useAction(
    (values: LoginValues) => api("/users", { method: "POST", body: { ...values, role: "CLIENT" } }),
    {
      success: (_, values) => `Login created for ${values.email}`,
      onDone: () => form.reset(EMPTY_LOGIN),
    },
  );

  return (
    <SectionCard
      title="Give a client a portal login"
      description="They’ll see only their own orders, payments and documents."
    >
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) => create.mutate(values))}
          className="grid gap-4 sm:grid-cols-2"
          noValidate
        >
          <FormField
            control={form.control}
            name="clientId"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>
                  Client <Required />
                </FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a client…" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {options.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.companyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Name <Required />
                </FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Login email <Required />
                </FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>
                  Password <Required />
                </FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormDescription>At least 8 characters. Share it with them securely.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <ErrorMessage error={create.error} className="sm:col-span-2" />
          <div className="sm:col-span-2">
            <Button type="submit" disabled={create.isPending}>
              <KeyRoundIcon />
              Create login
            </Button>
          </div>
        </form>
      </Form>
    </SectionCard>
  );
}
