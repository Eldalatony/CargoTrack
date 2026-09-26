"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeftIcon, ArrowUpRightIcon, CheckIcon, FilePlusIcon } from "lucide-react";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { ErrorMessage } from "@/components/common/error-message";
import { LoadingLines, QueryState } from "@/components/common/query-state";
import { AddBox, Optional, Required, SectionCard } from "@/components/common/section-card";
import { StatGrid } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input, UnitInput } from "@/components/ui/input";
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
import { payments } from "@/lib/api/queries";
import type { Order, PaymentType } from "@/lib/api/types";
import { amount, date, label, money, parseAmount } from "@/lib/format";
import { positiveAmount } from "@/lib/schemas";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";

export interface PaymentPreset {
  type: PaymentType;
  amount: string;
  /** Changes on every request, so asking twice still re-applies it. */
  nonce: number;
}

const FORM_TYPES = ["DEPOSIT", "BALANCE", "REFUND"] as const;

/**
 * Client money on the order. A row without a paid date is an invoice raised;
 * "Mark paid" records the money arriving. Paying the balance in full releases
 * the documents — and closes out an order in DOCUMENTS_WITHHELD by itself.
 */
export function PaymentsSection({
  order,
  preset,
}: {
  order: Order;
  preset: PaymentPreset | null;
}) {
  const { settlement, currency } = order;
  const list = useQuery(payments.forOrder(order.id));

  const markPaid = useAction(
    (id: string) => api(`/payments/${id}/paid`, { method: "POST", body: {} }),
    { success: "Payment marked as received" },
  );
  const voidInvoice = useAction(
    (id: string) => api(`/payments/${id}`, { method: "DELETE" }),
    { success: "Invoice voided" },
  );

  return (
    <SectionCard id="payments" title="Payments">
      <StatGrid
        stats={[
          { label: "Agreed price", value: money(settlement.agreedPrice, currency) },
          {
            label: "Deposit required",
            value: (
              <>
                {money(settlement.depositRequired, currency)}
                <span className="text-xs font-normal text-fg-tertiary">
                  {Number(order.depositPercentage)}%
                </span>
              </>
            ),
          },
          {
            label: "Deposit received",
            value: (
              <>
                {money(settlement.depositReceived, currency)}
                <Badge tone={settlement.depositMet ? "success" : "warning"} size="sm">
                  {settlement.depositMet ? "Met" : "Not met"}
                </Badge>
              </>
            ),
          },
          { label: "Collected", value: money(settlement.collected, currency) },
          {
            label: "Balance due",
            strong: true,
            value: (
              <>
                {money(settlement.balanceDue, currency)}
                <Badge tone={settlement.paidInFull ? "success" : "warning"} size="sm">
                  {settlement.paidInFull ? "Paid in full" : "Outstanding"}
                </Badge>
              </>
            ),
          },
        ]}
      />

      <QueryState query={list} loading={<LoadingLines rows={3} />}>
        {({ data }) =>
          data.length === 0 ? (
            <p className="m-0 text-sm text-fg-secondary">No invoices or payments yet.</p>
          ) : (
            <div className="overflow-hidden rounded-md border border-border">
              <Table style={{ minWidth: 720 }}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Raised</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((payment) => {
                    const inbound = payment.direction === "INBOUND";
                    return (
                      <TableRow key={payment.id}>
                        <TableCell className="font-medium">{label(payment.paymentType)}</TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1",
                              inbound ? "text-success-text" : "text-fg-secondary",
                            )}
                          >
                            {inbound ? (
                              <ArrowDownLeftIcon className="size-3.5" />
                            ) : (
                              <ArrowUpRightIcon className="size-3.5" />
                            )}
                            {inbound ? "In" : "Out"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {money(payment.amount, payment.currency)}
                        </TableCell>
                        <TableCell className="font-mono whitespace-nowrap text-fg-secondary">
                          {payment.reference || "—"}
                        </TableCell>
                        <TableCell className="text-fg-secondary tabular-nums">
                          {date(payment.createdAt)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {payment.paidAt ? (
                            date(payment.paidAt)
                          ) : (
                            <span className="font-medium text-warning-text">Outstanding</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {!payment.paidAt && (
                            <div className="inline-flex gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={markPaid.isPending}
                                onClick={() => markPaid.mutate(payment.id)}
                              >
                                Mark paid
                              </Button>
                              <Button
                                variant="destructive-ghost"
                                size="sm"
                                disabled={voidInvoice.isPending}
                                onClick={() => voidInvoice.mutate(payment.id)}
                              >
                                Void
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )
        }
      </QueryState>
      <ErrorMessage error={markPaid.error ?? voidInvoice.error} />

      <NewPayment order={order} preset={preset} />
    </SectionCard>
  );
}

const paymentSchema = z.object({
  paymentType: z.enum(FORM_TYPES),
  amount: positiveAmount(),
  reference: z.string().trim().max(200),
  received: z.boolean(),
});

type PaymentValues = z.infer<typeof paymentSchema>;

function NewPayment({ order, preset }: { order: Order; preset: PaymentPreset | null }) {
  const outstandingDeposit = Math.max(
    0,
    Number(order.settlement.depositRequired) - Number(order.settlement.depositReceived),
  );

  const suggested = (type: PaymentType) =>
    type === "BALANCE"
      ? amount(order.settlement.balanceDue)
      : type === "DEPOSIT"
        ? amount(outstandingDeposit)
        : "";

  const form = useForm<PaymentValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      paymentType: "BALANCE",
      amount: suggested("BALANCE"),
      reference: "",
      received: true,
    },
  });

  // The rail's "Record balance payment" fills the form in.
  useEffect(() => {
    if (preset) {
      form.reset({
        paymentType: preset.type as PaymentValues["paymentType"],
        amount: preset.amount,
        reference: "",
        received: true,
      });
      form.setFocus("amount");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.nonce]);

  const [type, received] = useWatch({ control: form.control, name: ["paymentType", "received"] });
  const refund = type === "REFUND";

  const create = useAction(
    (values: PaymentValues) =>
      api("/payments", {
        method: "POST",
        body: {
          orderId: order.id,
          paymentType: values.paymentType,
          amount: parseAmount(values.amount),
          currency: order.currency,
          ...(values.received ? { paidAt: new Date().toISOString() } : {}),
          ...(values.reference ? { reference: values.reference } : {}),
        },
      }),
    {
      success: (_, values) =>
        values.received
          ? values.paymentType === "REFUND"
            ? "Refund recorded"
            : "Payment recorded"
          : "Invoice raised",
      onDone: () => form.reset({ ...form.getValues(), amount: "", reference: "" }),
    },
  );

  return (
    <AddBox title="Raise an invoice or record a payment">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) => create.mutate(values))}
          className="flex flex-col gap-3"
          noValidate
        >
          <div className="flex flex-wrap items-start gap-3">
            <FormField
              control={form.control}
              name="paymentType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <FormControl>
                    <ToggleGroup
                      type="single"
                      aria-label="Payment type"
                      value={field.value}
                      onValueChange={(value) => {
                        if (!value) return;
                        field.onChange(value);
                        form.setValue("amount", suggested(value as PaymentType));
                      }}
                    >
                      {FORM_TYPES.map((value) => (
                        <ToggleGroupItem key={value} value={value}>
                          {label(value)}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem className="flex-[1_1_160px]">
                  <FormLabel>
                    Amount <Required />
                  </FormLabel>
                  <FormControl>
                    <UnitInput unit={order.currency} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reference"
              render={({ field }) => (
                <FormItem className="flex-[1_1_180px]">
                  <FormLabel>
                    Reference <Optional />
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Invoice or bank transfer no."
                      className="font-mono"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="received"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start gap-2">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                    className="mt-0.5"
                  />
                </FormControl>
                <div className="flex flex-col gap-0.5">
                  <FormLabel className="cursor-pointer">Money already received</FormLabel>
                  <span className="text-xs text-fg-secondary">
                    {received
                      ? refund
                        ? "Records a refund already sent to the client."
                        : "Records money already in the account. It counts toward the balance straight away."
                      : refund
                        ? "Raises a refund to send later."
                        : "Raises an invoice the client still has to pay."}
                  </span>
                </div>
              </FormItem>
            )}
          />

          <ErrorMessage error={create.error} />
          <div>
            <Button type="submit" disabled={create.isPending}>
              {received ? <CheckIcon /> : <FilePlusIcon />}
              {received ? (refund ? "Record refund" : "Record payment") : refund ? "Raise refund" : "Raise invoice"}
            </Button>
          </div>
        </form>
      </Form>
    </AddBox>
  );
}
