"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";

import { ErrorMessage } from "@/components/common/error-message";
import { LoadingPage } from "@/components/common/query-state";
import { OrderStatusBadge } from "@/components/common/status-badge";
import { DocumentsSection } from "@/components/documents/documents-section";
import { Crumbs, FactStrip, PageContainer, PageHeader } from "@/components/layout/page";
import { Stagger, StaggerItem } from "@/components/motion";
import { OrderItemsSection } from "@/components/orders/order-items-section";
import { OrderRail, scrollToSection } from "@/components/orders/order-rail";
import { OrderStatusSection } from "@/components/orders/order-status-section";
import { PaymentsSection, type PaymentPreset } from "@/components/orders/payments-section";
import { ProductionSection } from "@/components/orders/production-section";
import { StatusHistoryCard } from "@/components/orders/status-history";
import { documents, orders, payments } from "@/lib/api/queries";
import type { OrderStatus } from "@/lib/api/types";
import { amount, date, decimal, shortId } from "@/lib/format";

/**
 * Everything the office does to one order, top to bottom in the order it
 * happens: status, items, production and QC, money, documents, history —
 * with the order at a glance in the right rail.
 */
export default function ManagerOrderPage() {
  const { id } = useParams<{ id: string }>();

  const order = useQuery(orders.detail(id));
  const history = useQuery(orders.history(id));
  const docs = useQuery(documents.list({ orderId: id }));
  const paymentList = useQuery(payments.forOrder(id));

  const [pendingMove, setPendingMove] = useState<OrderStatus | null>(null);
  const [paymentPreset, setPaymentPreset] = useState<PaymentPreset | null>(null);

  if (order.isPending) {
    return <LoadingPage />;
  }

  if (order.isError) {
    return (
      <PageContainer>
        <ErrorMessage error={order.error} />
      </PageContainer>
    );
  }

  const data = order.data;
  const trail = history.data ?? [];

  function recordBalance() {
    setPaymentPreset({
      type: "BALANCE",
      amount: amount(data.settlement.balanceDue),
      nonce: Date.now(),
    });
    scrollToSection("payments");
  }

  return (
    <PageContainer className="pt-5">
      <div className="flex flex-col gap-4">
        <Crumbs items={[{ label: "Orders", href: "/manager" }, { label: shortId(data.id), mono: true }]} />
        <PageHeader title={`Order for ${data.client.companyName}`}>
          <OrderStatusBadge status={data.status} />
        </PageHeader>
        <FactStrip
          facts={[
            { label: "Order ID", value: shortId(data.id), mono: true },
            { label: "Placed", value: date(data.placedAt) },
            { label: "Required by", value: date(data.requiredBy) },
            {
              label: "Agreed price",
              value: (
                <>
                  {amount(data.agreedPrice)} {data.currency}{" "}
                  <span className="text-xs font-normal text-fg-secondary">
                    · deposit {decimal(data.depositPercentage, 2)}%
                  </span>
                </>
              ),
            },
            {
              label: "Volume / weight",
              value: `${decimal(data.totalCbm, 2)} CBM / ${decimal(data.totalWeightKg, 1)} kg`,
            },
            {
              label: "Closed",
              value: data.closedAt ? date(data.closedAt) : "Not closed yet",
              muted: !data.closedAt,
            },
          ]}
        />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="lg:col-start-2 lg:row-start-1 lg:self-stretch">
          <OrderRail
            order={data}
            history={trail}
            documents={docs.data?.data}
            counts={{
              items: data.items.length,
              production: data.productionOrders.length,
              payments: paymentList.data?.meta.total,
              documents: docs.data?.data.filter((doc) => doc.isCurrent).length,
              history: history.data?.length,
            }}
            onMove={setPendingMove}
            onRecordBalance={recordBalance}
          />
        </div>

        <Stagger className="flex min-w-0 flex-col gap-5 lg:col-start-1 lg:row-start-1">
          <StaggerItem>
            <OrderStatusSection
              order={data}
              history={trail}
              pendingMove={pendingMove}
              onPendingMove={setPendingMove}
              onRecordBalance={recordBalance}
            />
          </StaggerItem>
          <StaggerItem>
            <OrderItemsSection order={data} />
          </StaggerItem>
          <StaggerItem>
            <ProductionSection order={data} />
          </StaggerItem>
          <StaggerItem>
            <PaymentsSection order={data} preset={paymentPreset} />
          </StaggerItem>
          <StaggerItem>
            <DocumentsSection orderId={data.id} query={docs} />
          </StaggerItem>
          <StaggerItem>
            <StatusHistoryCard id="history" history={trail} />
          </StaggerItem>
        </Stagger>
      </div>
    </PageContainer>
  );
}
