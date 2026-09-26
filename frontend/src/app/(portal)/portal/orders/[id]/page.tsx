"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeftIcon, LockIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { ErrorMessage } from "@/components/common/error-message";
import { LoadingLines, QueryState } from "@/components/common/query-state";
import { SectionCard } from "@/components/common/section-card";
import { OrderStatusBadge } from "@/components/common/status-badge";
import { Timeline } from "@/components/common/timeline";
import { ClientDocumentList } from "@/components/documents/document-table";
import { PageContainer } from "@/components/layout/page";
import { Stagger, StaggerItem } from "@/components/motion";
import { buildOrderSteps } from "@/components/orders/order-steps";
import { OrderItemsSection } from "@/components/orders/order-items-section";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { documents, orders, payments } from "@/lib/api/queries";
import type { Settlement } from "@/lib/api/types";
import { date, label, money, shortId } from "@/lib/format";
import { ORDER_STATUS_FOR_CLIENT } from "@/lib/status";
import { cn } from "@/lib/utils";

/** Read-only: where the shipment is, what is owed, and the documents. */
export default function PortalOrderPage() {
  const { id } = useParams<{ id: string }>();

  const order = useQuery(orders.detail(id));
  const history = useQuery(orders.history(id));
  const docs = useQuery(documents.list({ orderId: id }));
  const paymentList = useQuery(payments.forOrder(id));

  if (order.isPending) {
    return (
      <PageContainer narrow>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 rounded-lg" />
      </PageContainer>
    );
  }

  if (order.isError) {
    return (
      <PageContainer narrow>
        <ErrorMessage error={order.error} />
      </PageContainer>
    );
  }

  const data = order.data;
  const withheld = docs.data?.data.some((doc) => doc.isCurrent && doc.withheld) ?? false;
  const steps = buildOrderSteps(data.status, history.data ?? [], (s) => ORDER_STATUS_FOR_CLIENT[s]);

  return (
    <PageContainer narrow className="gap-4 pt-3">
      <Link
        href="/portal"
        className="-mb-2 inline-flex min-h-11 w-max items-center gap-1 text-sm font-medium"
      >
        <ChevronLeftIcon className="size-[18px]" />
        All shipments
      </Link>

      <div>
        <div className="font-mono text-sm text-fg-secondary">{shortId(data.id)}</div>
        <h1 className="m-0 mt-0.5 mb-2 text-3xl font-semibold tracking-tight">
          Order placed {date(data.placedAt)}
        </h1>
        <OrderStatusBadge status={data.status} />
      </div>

      {!data.settlement.paidInFull && withheld && (
        <Alert variant="warning">
          <LockIcon />
          <AlertTitle>Pay to release your documents</AlertTitle>
          <AlertDescription>
            We’ll send your shipping documents as soon as the{" "}
            {money(data.settlement.balanceDue, data.currency)} balance is paid.
          </AlertDescription>
        </Alert>
      )}

      <Stagger className="flex flex-col gap-4">
        <StaggerItem>
          <SectionCard title="Where it is">
            <Timeline
              items={steps.map((step) => ({ title: step.label, time: step.date, state: step.state }))}
            />
          </SectionCard>
        </StaggerItem>

        <StaggerItem>
          <SectionCard title="What you owe" bodyClassName="p-0">
            <OwedTable settlement={data.settlement} />
            <QueryState query={paymentList} loading={<LoadingLines rows={2} />}>
              {({ data: rows }) =>
                rows.length > 0 ? (
                  <ul className="m-0 list-none border-t border-divider p-0">
                    {rows.map((payment) => (
                      <li
                        key={payment.id}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                      >
                        <span>
                          {label(payment.paymentType)}
                          <span className="block text-xs text-fg-secondary">
                            {payment.paidAt ? `Paid ${date(payment.paidAt)}` : "Awaiting payment"}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "tabular-nums",
                            payment.paidAt ? "text-success-text" : "font-medium text-warning-text",
                          )}
                        >
                          {money(payment.amount, payment.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null
              }
            </QueryState>
          </SectionCard>
        </StaggerItem>

        <StaggerItem>
          <SectionCard title="Documents" flush>
            <QueryState query={docs} loading={<LoadingLines rows={3} />}>
              {({ data: rows }) => <ClientDocumentList documents={rows} />}
            </QueryState>
          </SectionCard>
        </StaggerItem>

        <StaggerItem>
          <OrderItemsSection order={data} showLogistics={false} />
        </StaggerItem>
      </Stagger>
    </PageContainer>
  );
}

function OwedTable({ settlement }: { settlement: Settlement }) {
  const { currency } = settlement;
  const rows = [
    ["Agreed price", money(settlement.agreedPrice, currency)],
    ["Deposit required", money(settlement.depositRequired, currency)],
    ["Paid so far", money(settlement.collected, currency)],
  ];

  return (
    <dl className="m-0">
      {rows.map(([term, value]) => (
        <div key={term} className="flex justify-between gap-3 border-b border-divider px-4 py-2.5 text-sm">
          <dt className="text-fg-secondary">{term}</dt>
          <dd className="m-0 tabular-nums">{value}</dd>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-3 bg-subtle px-4 py-3">
        <dt className="font-semibold">Balance due</dt>
        <dd
          className={cn(
            "m-0 text-xl font-semibold tabular-nums",
            settlement.paidInFull ? "text-success-text" : "text-warning-text",
          )}
        >
          {money(settlement.balanceDue, currency)}
        </dd>
      </div>
    </dl>
  );
}
