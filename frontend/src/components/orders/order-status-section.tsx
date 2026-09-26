"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BanIcon,
  CircleAlertIcon,
  FlagIcon,
  LockIcon,
  TriangleAlertIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ErrorMessage } from "@/components/common/error-message";
import { Required, SectionCard } from "@/components/common/section-card";
import { Stepper } from "@/components/common/stepper";
import { Collapse } from "@/components/motion";
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
import { UnitInput } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api/client";
import type { Order, OrderStatus, StatusChange } from "@/lib/api/types";
import { money, parseAmount } from "@/lib/format";
import { lastChangeTo } from "@/lib/history";
import {
  EXCEPTION_AFTER,
  ORDER_EXCEPTIONS,
  ORDER_HAPPY_PATH,
  ORDER_NEXT,
} from "@/lib/lifecycles";
import { optionalAmount } from "@/lib/schemas";
import { ORDER_STATUS } from "@/lib/status";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";
import { buildOrderSteps } from "./order-steps";

type Variant = "default" | "outline" | "destructive-outline";

/** How a move is offered: its button style, icon and verb. */
export function describeMove(from: OrderStatus, to: OrderStatus) {
  // Where the order stands on the happy path (an exception sits after its anchor).
  const position = ORDER_HAPPY_PATH.indexOf(EXCEPTION_AFTER[from] ?? from);
  const backwards =
    ORDER_HAPPY_PATH.includes(to) &&
    (from === "CANCELLED" || ORDER_HAPPY_PATH.indexOf(to) <= position) &&
    to !== from;

  const variant: Variant =
    to === "DOCUMENTS_WITHHELD"
      ? "outline"
      : ORDER_EXCEPTIONS.includes(to)
        ? "destructive-outline"
        : backwards
          ? "outline"
          : "default";

  const icon: LucideIcon =
    to === "CLOSED_OUT"
      ? FlagIcon
      : to === "DOCUMENTS_WITHHELD"
        ? LockIcon
        : to === "CANCELLED"
          ? BanIcon
          : ORDER_EXCEPTIONS.includes(to)
            ? TriangleAlertIcon
            : backwards
              ? ArrowLeftIcon
              : ArrowRightIcon;

  return {
    variant,
    icon,
    label: `${backwards ? "Move back to" : "Move to"} ${ORDER_STATUS[to].label}`,
    needsReason: ORDER_EXCEPTIONS.includes(to),
    needsDeposit: to === "ORDER_CONFIRMED" && from === "ORDER_PLACED",
    /** Moves with extra input, or no way back, are confirmed first. */
    confirm: ORDER_EXCEPTIONS.includes(to) || to === "ORDER_CONFIRMED" || backwards,
  };
}

const moveSchema = z.object({
  deposit: optionalAmount("Enter the deposit amount you received."),
  reason: z.string().trim(),
});

type MoveValues = z.infer<typeof moveSchema>;

/**
 * The journey and the moves out of the current step. One button per move
 * the state diagram allows; the server has the final say, and a refused
 * move (deposit not cleared, balance unpaid, QC not signed) comes back as
 * an error naming the guard.
 */
export function OrderStatusSection({
  order,
  history,
  pendingMove,
  onPendingMove,
  onRecordBalance,
}: {
  order: Order;
  history: StatusChange[];
  pendingMove: OrderStatus | null;
  onPendingMove: (move: OrderStatus | null) => void;
  onRecordBalance: () => void;
}) {
  const [dismissed, setDismissed] = useState<unknown>(null);
  const next = ORDER_NEXT[order.status];
  const isException = ORDER_EXCEPTIONS.includes(order.status);
  const exceptionChange = isException ? lastChangeTo(history, order.status) : undefined;

  const outstandingDeposit = Math.max(
    0,
    Number(order.settlement.depositRequired) - Number(order.settlement.depositReceived),
  );

  const move = useAction(
    ({ to, values }: { to: OrderStatus; values: MoveValues }) =>
      api(`/orders/${order.id}/status`, {
        method: "POST",
        body: {
          status: to,
          ...(values.reason ? { reason: values.reason } : {}),
          ...(describeMove(order.status, to).needsDeposit && parseAmount(values.deposit) > 0
            ? { deposit: { amount: parseAmount(values.deposit) } }
            : {}),
        },
      }),
    {
      success: (_, { to }) => `Moved to ${ORDER_STATUS[to].label}`,
      onDone: () => onPendingMove(null),
    },
  );

  function start(to: OrderStatus) {
    move.reset();
    const described = describeMove(order.status, to);
    if (described.confirm) {
      onPendingMove(pendingMove === to ? null : to);
    } else {
      onPendingMove(null);
      move.mutate({ to, values: { deposit: "", reason: "" } });
    }
  }

  const error = move.error !== dismissed ? move.error : null;
  const balanceBlocked = error instanceof ApiError && error.guard === "balance";
  const excTone =
    order.status === "DOCUMENTS_WITHHELD" ? "warning" : order.status === "CANCELLED" ? "neutral" : "danger";

  return (
    <SectionCard
      id="status"
      title="Status"
      description="Each step shows the date it was reached"
      bodyClassName="flex flex-col gap-3 p-0"
    >
      <div className="px-4 pt-5">
        <Stepper steps={buildOrderSteps(order.status, history)} />
      </div>

      {isException && (
        <div
          className={cn(
            "mx-4 flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm",
            excTone === "warning" && "border-warning-border bg-warning-soft",
            excTone === "danger" && "border-danger-border bg-danger-soft",
            excTone === "neutral" && "border-border bg-subtle",
          )}
        >
          {order.status === "DOCUMENTS_WITHHELD" ? (
            <LockIcon className="mt-px size-4 shrink-0 text-warning-text" />
          ) : order.status === "CANCELLED" ? (
            <BanIcon className="mt-px size-4 shrink-0 text-fg-secondary" />
          ) : (
            <CircleAlertIcon className="mt-px size-4 shrink-0 text-danger-text" />
          )}
          <div>
            <strong
              className={cn(
                "font-semibold",
                excTone === "warning" && "text-warning-text",
                excTone === "danger" && "text-danger-text",
                excTone === "neutral" && "text-fg-secondary",
              )}
            >
              {ORDER_STATUS[order.status].label}.
            </strong>{" "}
            {exceptionChange?.reason ?? ""}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 px-4 pb-4">
        {error && (
          <ErrorMessage error={error}>
            {balanceBlocked && (
              <>
                <Button variant="outline" size="sm" onClick={onRecordBalance}>
                  <WalletIcon />
                  Record balance payment
                </Button>
                {next.includes("DOCUMENTS_WITHHELD") && (
                  <Button variant="outline" size="sm" onClick={() => start("DOCUMENTS_WITHHELD")}>
                    <LockIcon />
                    Move to Documents withheld
                  </Button>
                )}
              </>
            )}
            <Button variant="ghost" size="sm" onClick={() => setDismissed(move.error)}>
              Dismiss
            </Button>
          </ErrorMessage>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm font-medium text-fg-secondary">
            {next.length
              ? "Next moves"
              : `${ORDER_STATUS[order.status].label} — no further moves`}
          </span>
          {next.map((to) => {
            const described = describeMove(order.status, to);
            const Icon = described.icon;
            return (
              <Button
                key={to}
                variant={described.variant}
                aria-pressed={pendingMove === to}
                disabled={move.isPending}
                onClick={() => start(to)}
                className="aria-pressed:ring-[3px] aria-pressed:ring-ring"
              >
                <Icon />
                {described.label}
              </Button>
            );
          })}
        </div>

        <Collapse open={!!pendingMove}>
          {pendingMove && (
            <ConfirmMovePanel
              key={pendingMove}
              order={order}
              to={pendingMove}
              defaultDeposit={outstandingDeposit > 0 ? outstandingDeposit.toFixed(2) : ""}
              saving={move.isPending}
              onConfirm={(values) => move.mutate({ to: pendingMove, values })}
              onCancel={() => onPendingMove(null)}
            />
          )}
        </Collapse>
      </div>
    </SectionCard>
  );
}

/** The inline "are you sure" for a move that needs a deposit or a reason. */
function ConfirmMovePanel({
  order,
  to,
  defaultDeposit,
  saving,
  onConfirm,
  onCancel,
}: {
  order: Order;
  to: OrderStatus;
  defaultDeposit: string;
  saving: boolean;
  onConfirm: (values: MoveValues) => void;
  onCancel: () => void;
}) {
  const pending = describeMove(order.status, to);
  const form = useForm<MoveValues>({
    resolver: zodResolver(moveSchema),
    defaultValues: { deposit: defaultDeposit, reason: "" },
  });

  function submit(values: MoveValues) {
    if (pending.needsReason && !values.reason) {
      form.setError("reason", { message: "Give a reason for this move." });
      return;
    }
    onConfirm(values);
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(submit)}
        className="flex flex-col gap-3 rounded-md border border-border bg-subtle p-3.5"
        noValidate
      >
        <div className="text-base font-semibold">{pending.label}</div>

        {pending.needsDeposit && (
          <FormField
            control={form.control}
            name="deposit"
            render={({ field }) => (
              <FormItem className="max-w-[280px]">
                <FormLabel>Deposit received</FormLabel>
                <FormControl>
                  <UnitInput unit={order.currency} {...field} />
                </FormControl>
                <FormMessage />
                <FormDescription>
                  {Number(order.depositPercentage)}% of the agreed price is{" "}
                  {money(order.settlement.depositRequired, order.currency)}. Leave it empty if
                  the money hasn’t arrived yet.
                </FormDescription>
              </FormItem>
            )}
          />
        )}

        {!pending.needsDeposit && (
          <FormField
            control={form.control}
            name="reason"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Reason {pending.needsReason && <Required />}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={2}
                    placeholder="e.g. Factory lost its glaze supplier and can’t deliver the plates"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
                <FormDescription>Saved in the status history.</FormDescription>
              </FormItem>
            )}
          />
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            variant={pending.variant === "destructive-outline" ? "destructive" : "default"}
            disabled={saving}
          >
            {saving ? "Saving…" : `Confirm: ${ORDER_STATUS[to].label}`}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
