"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { FactoryIcon, PlusIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorMessage } from "@/components/common/error-message";
import { LoadingLines, QueryState } from "@/components/common/query-state";
import { Required, SectionCard } from "@/components/common/section-card";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api/client";
import { suppliers } from "@/lib/api/queries";
import { requiredText } from "@/lib/schemas";
import { useAction } from "@/lib/use-action";

const schema = z.object({
  name: requiredText("Enter the factory’s name."),
  country: requiredText("Enter the country."),
});

type Values = z.infer<typeof schema>;

const EMPTY: Values = { name: "", country: "China" };

export default function SuppliersPage() {
  const list = useQuery(suppliers.all());

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  const create = useAction((values: Values) => api("/suppliers", { method: "POST", body: values }), {
    success: (_, values) => `${values.name} added`,
    onDone: () => form.reset(EMPTY),
  });

  return (
    <PageContainer>
      <PageHeader
        title="Suppliers"
        description="The factories you place production orders with."
      />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <SectionCard title="All suppliers" flush>
          <QueryState query={list} loading={<LoadingLines rows={5} />}>
            {({ data }) =>
              data.length === 0 ? (
                <EmptyState
                  icon={FactoryIcon}
                  title="No suppliers yet"
                  description="Add the factories you buy from, then place production orders with them."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Country</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((supplier) => (
                      <TableRow key={supplier.id}>
                        <TableCell className="font-medium">
                          <span className="inline-flex items-center gap-2">
                            <FactoryIcon className="size-3.5 text-fg-tertiary" aria-hidden />
                            {supplier.name}
                          </span>
                        </TableCell>
                        <TableCell>{supplier.country}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            }
          </QueryState>
        </SectionCard>

        <SectionCard title="Add a supplier" className="lg:sticky lg:top-[68px]">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((values) => create.mutate(values))}
              className="flex flex-col gap-4"
              noValidate
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Name <Required />
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Chaozhou Ceramics Co." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Country <Required />
                    </FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <ErrorMessage error={create.error} />
              <div>
                <Button type="submit" disabled={create.isPending}>
                  <PlusIcon />
                  Add supplier
                </Button>
              </div>
            </form>
          </Form>
        </SectionCard>
      </div>
    </PageContainer>
  );
}
