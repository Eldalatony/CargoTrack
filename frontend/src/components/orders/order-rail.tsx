"use client";

import { CircleAlertIcon, CircleCheckIcon, LockIcon, WalletIcon } from "lucide-react";

import { OrderStatusBadge } from "@/components/common/status-badge";
import { Overline } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { CargoDocument, Order, OrderStatus, StatusChange } from "@/lib/api/types";
import { amount, date, money } from "@/lib/format";
import { lastChangeTo } from "@/lib/history";
import { ORDER_EXCEPTIONS, ORDER_NEXT } from "@/lib/lifecycles";
import { ORDER_NEXT_ACTION } from "@/lib/status";
import { cn } from "@/lib/utils";
import { describeMove } from "./order-status-section";

/** Scrolls a section into view, below the sticky header. */
export function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * The order at a glance, pinned beside the sections on wide screens and on
 * top of them on narrow ones: where it is, what to do next, what's owed.
 */
export function OrderRail({
  order,
  history,
  documents,
  counts,
  onMove,
  onRecordBalance,
}: {
  order: Order;
  history: StatusChange[];
  documents: CargoDocument[] | undefined;
  counts: Record<"items" | "production" | "payments" | "documents" | "history", number | undefined>;
  onMove: (to: OrderStatus) => void;
  onRecordBalance: () => void;
}) {
  const { settlement } = order;
  const balance = Number(settlement.balanceDue);
  const collectedPct = Number(settlement.agreedPrice)
    ? (100 * Number(settlement.collected)) / Number(settlement.agreedPrice)
    : 0;
  const since = lastChangeTo(history, order.status)?.changedAt;
  const withheld = documents?.filter((doc) => doc.isCurrent && doc.withheld).length ?? 0;

  // The next action: money first when it's the only thing in the way.
  const primary = ORDER_NEXT[order.status].find(
    (to) => !ORDER_EXCEPTIONS.includes(to) || to === "CLOSED_OUT",
  );
  const collectFirst =
    (order.status === "DELIVERED" || order.status === "DOCUMENTS_WITHHELD") && balance > 0;

  const nextText = collectFirst
    ? `Collect the ${money(settlement.balanceDue, order.currency)} balance before this order can close out.`
    : ORDER_NEXT_ACTION[order.status];

  const sections = [
    ["status", "Status", undefined],
    ["items", "Items", counts.items],
    ["production", "Production and QC", counts.production],
    ["payments", "Payments", counts.payments],
    ["documents", "Documents", counts.documents],
    ["history", "Status history", counts.history],
  ] as const;

  return (
    <aside aria-label="Order summary" className="flex flex-col gap-3 lg:sticky lg:top-[68px]">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-divider px-4 py-3.5">
          <div className="flex items-center justify-between gap-2">
            <Overline>Status</Overline>
            {since && (
              <span className="text-xs text-fg-tertiary tabular-nums">since {date(since)}</span>
            )}
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        <div className="flex flex-col gap-2.5 border-b border-divider bg-subtle px-4 py-3.5">
          <Overline>Next action</Overline>
          <p className="m-0 text-sm text-pretty">{nextText}</p>
          {collectFirst ? (
            <Button className="w-full" onClick={onRecordBalance}>
              <WalletIcon />
              Record balance payment
            </Button>
          ) : (
            primary && (
              <Button
                className="w-full"
                onClick={() => {
                  onMove(primary);
                  scrollToSection("status");
                }}
              >
                {(() => {
                  const { icon: Icon, label } = describeMove(order.status, primary);
                  return (
                    <>
                      <Icon />
                      {label}
                    </>
                  );
                })()}
              </Button>
            )
          )}
        </div>

        <div className="flex flex-col gap-2 border-b border-divider px-4 py-3.5">
          <Overline>Balance due</Overline>
          <span
            className={cn(
              "text-3xl font-semibold tabular-nums",
              balance > 0 ? "text-warning-text" : "text-success-text",
            )}
          >
            {amount(settlement.balanceDue)}{" "}
            <span className="text-sm font-medium text-fg-secondary">{order.currency}</span>
          </span>
          <Progress
            value={collectedPct}
            aria-label="Collected"
            indicatorClassName="bg-success-solid"
          />
          <span className="text-xs text-fg-secondary tabular-nums">
            {amount(settlement.collected)} of {money(settlement.agreedPrice, order.currency)}{" "}
            collected
          </span>
        </div>

        <dl className="m-0 px-4 pt-1.5 pb-2.5 text-sm">
          <div className="flex justify-between gap-3 py-1.5">
            <dt className="text-fg-secondary">Deposit</dt>
            <dd
              className={cn(
                "m-0 inline-flex items-center gap-1",
                settlement.depositMet ? "text-success-text" : "text-warning-text",
              )}
            >
              {settlement.depositMet ? (
                <CircleCheckIcon className="size-3.5" />
              ) : (
                <CircleAlertIcon className="size-3.5" />
              )}
              {settlement.depositMet ? "Met" : "Not met"}
            </dd>
          </div>
          <div className="flex justify-between gap-3 py-1.5">
            <dt className="text-fg-secondary">Client documents</dt>
            <dd
              className={cn(
                "m-0 inline-flex items-center gap-1",
                withheld ? "text-warning-text" : "text-success-text",
              )}
            >
              {withheld ? <LockIcon className="size-3.5" /> : <CircleCheckIcon className="size-3.5" />}
              {withheld ? `${withheld} withheld` : "All released"}
            </dd>
          </div>
        </dl>
      </Card>

      <nav aria-label="On this page" className="hidden flex-col py-1 lg:flex">
        {sections.map(([id, title, count]) => (
          <a
            key={id}
            href={`#${id}`}
            className="flex justify-between rounded-md px-3 py-1.5 text-sm text-fg-secondary hover:bg-hover hover:text-fg hover:no-underline"
          >
            {title}
            {count !== undefined && <span className="text-fg-tertiary tabular-nums">{count}</span>}
          </a>
        ))}
      </nav>
    </aside>
  );
}
