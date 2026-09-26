"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRightIcon, PackageIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { QueryState } from "@/components/common/query-state";
import { OrderStatusBadge } from "@/components/common/status-badge";
import { PageContainer } from "@/components/layout/page";
import { Stagger, StaggerItem } from "@/components/motion";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { orders } from "@/lib/api/queries";
import type { OrderStatus } from "@/lib/api/types";
import { useUser } from "@/lib/auth/auth-context";
import { date, money, shortId } from "@/lib/format";
import { ORDER_HAPPY_PATH } from "@/lib/lifecycles";
import { ORDER_STATUS_FOR_CLIENT } from "@/lib/status";

/** How far along the 8-step journey an order is, for the card's bar. */
function progressOf(status: OrderStatus) {
  if (status === "DOCUMENTS_WITHHELD") return (7 / 8) * 100;
  const step = ORDER_HAPPY_PATH.indexOf(status);
  return step < 0 ? 0 : ((step + 1) / ORDER_HAPPY_PATH.length) * 100;
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/**
 * The client's shipments. The request carries no client id — the API scopes
 * it to the signed-in client, so nothing here could ask for someone else's.
 */
export default function PortalOrdersPage() {
  const user = useUser();
  const list = useQuery(orders.list({ limit: 100 }));

  return (
    <PageContainer narrow className="gap-4">
      <div>
        <div className="text-sm text-fg-secondary">
          {greeting()}, {user.name.split(" ")[0]}
        </div>
        <h1 className="m-0 mt-0.5 text-3xl font-semibold tracking-tight">Your shipments</h1>
      </div>

      <QueryState
        query={list}
        loading={
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-[120px] rounded-lg" />
            ))}
          </div>
        }
      >
        {({ data }) =>
          data.length === 0 ? (
            <Card>
              <EmptyState
                icon={PackageIcon}
                title="No shipments yet"
                description="When the office places an order for you, you’ll follow it here from the factory to your door."
              />
            </Card>
          ) : (
            <Stagger className="flex flex-col gap-3">
              {data.map((order) => (
                <StaggerItem key={order.id}>
                  <Link
                    href={`/portal/orders/${order.id}`}
                    className="block rounded-lg border border-border bg-surface p-3.5 text-fg transition-colors duration-150 outline-none hover:border-strong hover:text-fg hover:no-underline focus-visible:ring-[3px] focus-visible:ring-ring"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm text-fg-secondary">{shortId(order.id)}</span>
                      <OrderStatusBadge status={order.status} size="sm" />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-base font-semibold">
                        {ORDER_STATUS_FOR_CLIENT[order.status]}
                      </span>
                      <ChevronRightIcon className="size-4 text-fg-tertiary" aria-hidden />
                    </div>
                    <div className="mt-0.5 mb-3 text-sm text-fg-secondary tabular-nums">
                      {order._count.items} {order._count.items === 1 ? "item" : "items"} ·{" "}
                      {money(order.agreedPrice, order.currency)} · placed {date(order.placedAt)}
                    </div>
                    <Progress
                      value={progressOf(order.status)}
                      aria-label="Journey progress"
                      indicatorClassName={
                        order.status === "CLOSED_OUT"
                          ? "bg-success-solid"
                          : order.status === "DOCUMENTS_WITHHELD"
                            ? "bg-warning-solid"
                            : "bg-brand"
                      }
                    />
                  </Link>
                </StaggerItem>
              ))}
            </Stagger>
          )
        }
      </QueryState>
    </PageContainer>
  );
}
