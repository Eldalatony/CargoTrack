"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CircleAlertIcon,
  LockIcon,
  PackageIcon,
  PlusIcon,
  SearchXIcon,
  ShipIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { DataTable } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { Pagination } from "@/components/common/pagination";
import { LoadingLines, QueryState } from "@/components/common/query-state";
import { StatTile } from "@/components/common/stat-tile";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Stagger, StaggerItem } from "@/components/motion";
import { orderColumns } from "@/components/orders/order-columns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { notifications, orders } from "@/lib/api/queries";
import type { OrderStatus } from "@/lib/api/types";
import { ORDER_EXCEPTIONS, ORDER_HAPPY_PATH } from "@/lib/lifecycles";
import { ORDER_STATUS } from "@/lib/status";

const ALL = "all";
const PAGE_SIZE = 25;

export default function OrdersDashboard() {
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [page, setPage] = useState(1);

  const list = useQuery(orders.list({ page, limit: PAGE_SIZE, status }));
  const inTransit = useQuery(orders.count("IN_TRANSIT"));
  const withheld = useQuery(orders.count("DOCUMENTS_WITHHELD"));
  const summary = useQuery(notifications.summary());
  const dead = summary.data?.DEAD_LETTER ?? 0;

  function filterBy(next: OrderStatus | "") {
    setStatus(next);
    setPage(1);
  }

  const toggle = (next: OrderStatus) => filterBy(status === next ? "" : next);

  return (
    <>
      {dead > 0 && (
        <div role="alert" className="border-b border-danger-border bg-danger-soft">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-2.5 px-4 py-2.5 sm:px-5">
            <CircleAlertIcon className="size-[18px] text-danger-text" aria-hidden />
            <span className="text-sm">
              <strong className="font-semibold text-danger-text">
                {dead === 1
                  ? "1 notification failed permanently."
                  : `${dead} notifications failed permanently.`}
              </strong>{" "}
              {dead === 1 ? "It will not be retried." : "They will not be retried."}
            </span>
            <Link
              href="/manager/notifications"
              className="text-sm font-medium whitespace-nowrap text-danger-text underline underline-offset-2 hover:text-danger-text"
            >
              Review failed notifications →
            </Link>
          </div>
        </div>
      )}

      <PageContainer>
        <PageHeader
          title="Orders"
          description="Every client order, from factory to delivery."
          actions={
            <Button asChild>
              <Link href="/manager/orders/new">
                <PlusIcon />
                Place a new order
              </Link>
            </Button>
          }
        />

        <Stagger className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
          <StaggerItem>
            <StatTile
              label="In transit"
              icon={ShipIcon}
              iconClassName="text-brand"
              count={inTransit.data}
              sub={inTransit.data ? "On the water to Egypt" : "Nothing on the water right now"}
              active={status === "IN_TRANSIT"}
              onClick={() => toggle("IN_TRANSIT")}
            />
          </StaggerItem>
          <StaggerItem>
            <StatTile
              label="Documents withheld"
              icon={LockIcon}
              iconClassName="text-warning-text"
              count={withheld.data}
              sub={withheld.data ? "Released once the client pays" : "No documents on hold"}
              active={status === "DOCUMENTS_WITHHELD"}
              onClick={() => toggle("DOCUMENTS_WITHHELD")}
            />
          </StaggerItem>
        </Stagger>

        <Card>
          <div className="flex flex-wrap items-center gap-3 border-b border-divider px-4 py-3">
            <Label htmlFor="status-filter" className="text-fg-secondary">
              Status
            </Label>
            <Select
              value={status || ALL}
              onValueChange={(value) => filterBy(value === ALL ? "" : (value as OrderStatus))}
            >
              <SelectTrigger id="status-filter" size="sm" className="w-[260px] max-w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                <SelectGroup>
                  <SelectLabel>Order journey</SelectLabel>
                  {ORDER_HAPPY_PATH.map((value) => (
                    <SelectItem key={value} value={value}>
                      {ORDER_STATUS[value].label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Exceptions</SelectLabel>
                  {ORDER_EXCEPTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {ORDER_STATUS[value].label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {status && (
              <Button variant="ghost" size="sm" className="text-link" onClick={() => filterBy("")}>
                <XIcon />
                Clear filter
              </Button>
            )}
          </div>

          <QueryState query={list} loading={<LoadingLines rows={6} />}>
            {({ data, meta }) => (
              <>
                <DataTable
                  columns={orderColumns}
                  data={data}
                  initialSorting={[{ id: "placed", desc: true }]}
                  empty={
                    status ? (
                      <EmptyState
                        icon={SearchXIcon}
                        title={`No orders are “${ORDER_STATUS[status].label}”`}
                        description="Choose another status, or clear the filter to see every order."
                        action={
                          <Button variant="outline" size="sm" onClick={() => filterBy("")}>
                            Clear filter
                          </Button>
                        }
                      />
                    ) : (
                      <EmptyState
                        icon={PackageIcon}
                        title="No orders yet"
                        description="When a client asks you to buy from a factory, place the order here. You’ll track it from the factory all the way to Egypt."
                        action={
                          <Button asChild>
                            <Link href="/manager/orders/new">
                              <PlusIcon />
                              Place a new order
                            </Link>
                          </Button>
                        }
                      />
                    )
                  }
                />
                <Pagination
                  page={meta.page}
                  totalPages={meta.totalPages}
                  onPage={setPage}
                  summary={`${meta.total} ${meta.total === 1 ? "order" : "orders"}${status ? " · filtered" : ""}`}
                />
              </>
            )}
          </QueryState>
        </Card>
      </PageContainer>
    </>
  );
}
