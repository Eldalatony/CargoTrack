"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { BanIcon, CircleCheckIcon, FactoryIcon, PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { DashedNote } from "@/components/common/empty-state";
import { ErrorMessage } from "@/components/common/error-message";
import { AddBox, Required, SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { Collapse, Stagger, StaggerItem } from "@/components/motion";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/lib/api/client";
import { suppliers } from "@/lib/api/queries";
import type {
  Order,
  ProductionOrder,
  ProductionOrderStatus,
  QcOutcome,
} from "@/lib/api/types";
import { amount, date, parseAmount } from "@/lib/format";
import { PRODUCTION_NEXT } from "@/lib/lifecycles";
import { positiveAmount, requiredText } from "@/lib/schemas";
import { PRODUCTION_STATUS, QC_OUTCOME } from "@/lib/status";
import { useAction } from "@/lib/use-action";

/** The steps shown on each batch's segmented control. */
const BATCH_STEPS: { status: ProductionOrderStatus; label: string }[] = [
  { status: "IN_PRODUCTION", label: "In production" },
  { status: "READY", label: "Ready" },
  { status: "RECEIVED", label: "Received" },
];

/** Factory batches for the order, their QC inspections, and sign-off. */
export function ProductionSection({ order }: { order: Order }) {
  return (
    <SectionCard id="production" title="Production and QC" description="One card per factory batch">
      {order.productionOrders.length === 0 ? (
        <DashedNote>No production orders yet. Place one with a factory below.</DashedNote>
      ) : (
        <Stagger className="flex flex-col gap-4">
          {order.productionOrders.map((batch) => (
            <StaggerItem key={batch.id}>
              <ProductionBatch batch={batch} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
      <NewProductionOrder order={order} />
    </SectionCard>
  );
}

function ProductionBatch({ batch }: { batch: ProductionOrder }) {
  const [formOpen, setFormOpen] = useState(false);
  const allowed = PRODUCTION_NEXT[batch.status];
  const inspectable = batch.status === "READY" || batch.status === "RECEIVED";

  const move = useAction(
    (status: ProductionOrderStatus) =>
      api(`/production-orders/${batch.id}/status`, { method: "POST", body: { status } }),
    { success: (_, status) => `${batch.supplier.name}: ${PRODUCTION_STATUS[status].label}` },
  );

  const signOff = useAction(
    (inspectionId: string) =>
      api(`/qc-inspections/${inspectionId}/sign-off`, { method: "PATCH", body: {} }),
    { success: "Client sign-off recorded" },
  );

  return (
    <article className="overflow-hidden rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider bg-subtle px-3.5 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-base font-semibold">
          <FactoryIcon className="size-4 text-fg-tertiary" aria-hidden />
          <span>{batch.supplier.name}</span>
          <span className="text-fg-tertiary">—</span>
          <span className="tabular-nums">
            {amount(batch.agreedCost)} {batch.currency}
          </span>
          <span className="text-fg-tertiary">—</span>
          <StatusBadge meta={PRODUCTION_STATUS[batch.status]} size="sm" />
        </div>

        {batch.status !== "CANCELLED" && batch.status !== "RECEIVED" && (
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              size="sm"
              aria-label="Batch status"
              value={batch.status}
              onValueChange={(value) => value && move.mutate(value as ProductionOrderStatus)}
            >
              {BATCH_STEPS.map((step) => (
                <ToggleGroupItem
                  key={step.status}
                  value={step.status}
                  disabled={
                    move.isPending ||
                    (step.status !== batch.status && !allowed.includes(step.status))
                  }
                >
                  {step.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {allowed.includes("CANCELLED") && (
              <Button
                variant="destructive-ghost"
                size="sm"
                disabled={move.isPending}
                onClick={() => move.mutate("CANCELLED")}
              >
                <BanIcon />
                Cancel batch
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2.5 px-3.5 py-3">
        <ErrorMessage error={move.error} />

        <div className="flex items-center justify-between gap-2">
          <h3 className="m-0 text-sm font-medium">QC inspections</h3>
          {inspectable && (
            <Button variant="outline" size="sm" onClick={() => setFormOpen((open) => !open)}>
              {formOpen ? <XIcon /> : <PlusIcon />}
              {formOpen ? "Close form" : "Record inspection"}
            </Button>
          )}
        </div>

        {batch.inspections.length === 0 ? (
          <DashedNote>
            {inspectable
              ? "No inspections yet. Record one when the goods are checked at the factory."
              : "Inspections can be recorded once the batch is ready."}
          </DashedNote>
        ) : (
          <div className="overflow-hidden rounded-md border border-divider">
            <Table style={{ minWidth: 560 }}>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px] py-1.5">Date</TableHead>
                  <TableHead className="w-[100px] py-1.5">Outcome</TableHead>
                  <TableHead className="py-1.5">Notes</TableHead>
                  <TableHead className="w-[190px] py-1.5 text-right">Client sign-off</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batch.inspections.map((inspection) => (
                  <TableRow key={inspection.id}>
                    <TableCell className="text-fg-secondary tabular-nums">
                      {date(inspection.inspectedAt)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge meta={QC_OUTCOME[inspection.outcome]} size="sm" />
                    </TableCell>
                    <TableCell>{inspection.rejectionNotes || "—"}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {inspection.clientSignedOffAt ? (
                        <span className="inline-flex items-center gap-1 text-success-text tabular-nums">
                          <CircleCheckIcon className="size-3.5" />
                          Signed {date(inspection.clientSignedOffAt)}
                        </span>
                      ) : inspection.outcome === "REJECTED" ? (
                        <span className="text-fg-tertiary">Can’t be signed (rejected)</span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={signOff.isPending}
                          onClick={() => signOff.mutate(inspection.id)}
                        >
                          Record client sign-off
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <ErrorMessage error={signOff.error} />

        <Collapse open={formOpen && inspectable}>
          <NewInspection productionOrderId={batch.id} onDone={() => setFormOpen(false)} />
        </Collapse>
      </div>
    </article>
  );
}

const inspectionSchema = z.object({
  outcome: z.enum(["PASSED", "PARTIAL", "REJECTED"]),
  notes: z.string().trim(),
});

type InspectionValues = z.infer<typeof inspectionSchema>;

function NewInspection({
  productionOrderId,
  onDone,
}: {
  productionOrderId: string;
  onDone: () => void;
}) {
  const form = useForm<InspectionValues>({
    resolver: zodResolver(inspectionSchema),
    defaultValues: { outcome: "PASSED", notes: "" },
  });

  const record = useAction(
    (values: InspectionValues) =>
      api("/qc-inspections", {
        method: "POST",
        body: {
          productionOrderId,
          inspectedAt: new Date().toISOString(),
          outcome: values.outcome,
          ...(values.notes ? { rejectionNotes: values.notes } : {}),
        },
      }),
    {
      success: "Inspection recorded",
      onDone: () => {
        form.reset();
        onDone();
      },
    },
  );

  function submit(values: InspectionValues) {
    if (values.outcome === "REJECTED" && !values.notes) {
      form.setError("notes", { message: "Say what failed — it’s required for a rejection." });
      return;
    }
    record.mutate(values);
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(submit)}
        className="flex flex-wrap items-start gap-3 rounded-md bg-subtle p-3"
        noValidate
      >
        <FormField
          control={form.control}
          name="outcome"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Outcome</FormLabel>
              <FormControl>
                <ToggleGroup
                  type="single"
                  aria-label="Outcome"
                  value={field.value}
                  onValueChange={(value) => value && field.onChange(value as QcOutcome)}
                >
                  {(Object.keys(QC_OUTCOME) as QcOutcome[]).map((outcome) => (
                    <ToggleGroupItem key={outcome} value={outcome}>
                      {QC_OUTCOME[outcome].label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem className="min-w-[240px] flex-1">
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Input placeholder="What was checked, what failed" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-col gap-1.5">
          <span className="invisible text-sm">Record</span>
          <Button type="submit" disabled={record.isPending}>
            Record inspection
          </Button>
        </div>
        <ErrorMessage error={record.error} className="basis-full" />
      </form>
    </Form>
  );
}

const productionSchema = z.object({
  supplierId: requiredText("Choose a supplier."),
  agreedCost: positiveAmount("Enter the production cost."),
  currency: z.string().length(3),
});

type ProductionValues = z.infer<typeof productionSchema>;

function NewProductionOrder({ order }: { order: Order }) {
  const supplierList = useQuery(suppliers.all());
  const currencies = [...new Set([order.currency, "CNY", "USD"])];

  const form = useForm<ProductionValues>({
    resolver: zodResolver(productionSchema),
    defaultValues: { supplierId: "", agreedCost: "", currency: "CNY" },
  });

  const create = useAction(
    (values: ProductionValues) =>
      api("/production-orders", {
        method: "POST",
        body: {
          orderId: order.id,
          supplierId: values.supplierId,
          agreedCost: parseAmount(values.agreedCost),
          currency: values.currency,
        },
      }),
    {
      success: "Production order created",
      onDone: () => form.reset({ ...form.getValues(), supplierId: "", agreedCost: "" }),
    },
  );

  return (
    <AddBox title="New production order">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) => create.mutate(values))}
          className="flex flex-wrap items-start gap-3"
          noValidate
        >
          <FormField
            control={form.control}
            name="supplierId"
            render={({ field }) => (
              <FormItem className="min-w-[220px] flex-[2_1_220px]">
                <FormLabel>
                  Supplier <Required />
                </FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose supplier" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {supplierList.data?.data.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}{" "}
                        <span className="text-fg-tertiary">· {supplier.country}</span>
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
            name="agreedCost"
            render={({ field }) => (
              <FormItem className="flex-[1_1_160px]">
                <FormLabel>
                  Cost <Required />
                </FormLabel>
                <FormControl>
                  <Input
                    inputMode="decimal"
                    placeholder="0.00"
                    className="text-right tabular-nums"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem className="flex-[0_1_110px]">
                <FormLabel>Currency</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {currencies.map((currency) => (
                      <SelectItem key={currency} value={currency}>
                        {currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <div className="flex flex-col gap-1.5">
            <span className="invisible text-sm">Create</span>
            <Button type="submit" variant="outline" disabled={create.isPending}>
              <PlusIcon />
              Create production order
            </Button>
          </div>
        </form>
      </Form>
      <ErrorMessage error={create.error} />
    </AddBox>
  );
}
