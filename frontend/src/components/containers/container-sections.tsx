"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import {
  AnchorIcon,
  ArrowRightIcon,
  FlagIcon,
  LockIcon,
  PlusIcon,
  ShipIcon,
  UploadIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ErrorMessage } from "@/components/common/error-message";
import { LoadingLines, QueryState } from "@/components/common/query-state";
import { SectionCard } from "@/components/common/section-card";
import { OrderStatusBadge } from "@/components/common/status-badge";
import { Stepper, type Step } from "@/components/common/stepper";
import { DocumentList } from "@/components/documents/document-table";
import { UploadDocumentForm } from "@/components/documents/upload-document-form";
import { Collapse } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api/client";
import { documents, orders } from "@/lib/api/queries";
import type { Container, ContainerStatus, StatusChange } from "@/lib/api/types";
import { date, decimal, shortId } from "@/lib/format";
import { reachedAt, stepDate } from "@/lib/history";
import { CONTAINER_NEXT } from "@/lib/lifecycles";
import { TRANSIT_PORTS } from "@/lib/ports";
import { requiredText } from "@/lib/schemas";
import { CONTAINER_STATUS } from "@/lib/status";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";
import { SERIES } from "./capacity-card";

const FLOW: ContainerStatus[] = [
  "OPEN_FOR_ALLOCATION",
  "FULLY_ALLOCATED",
  "DEPARTED",
  "ARRIVED",
  "CLOSED",
];

const MOVE: Record<ContainerStatus, { label: string; icon: LucideIcon }> = {
  OPEN_FOR_ALLOCATION: { label: "Reopen for allocation", icon: ArrowRightIcon },
  FULLY_ALLOCATED: { label: "Mark Fully allocated", icon: LockIcon },
  DEPARTED: { label: "Move to Departed", icon: ShipIcon },
  ARRIVED: { label: "Move to Arrived", icon: AnchorIcon },
  CLOSED: { label: "Move to Closed", icon: FlagIcon },
};

/** The box's five steps and the move out of the current one. */
export function ContainerStatusCard({
  container,
  history,
}: {
  container: Container;
  history: StatusChange[];
}) {
  const next = CONTAINER_NEXT[container.status];
  const reached = reachedAt(history);
  const index = FLOW.indexOf(container.status);

  const steps: Step[] = FLOW.map((status, i) => ({
    label: CONTAINER_STATUS[status].label,
    date: stepDate(reached, status),
    state:
      i < index ? "done" : i === index ? (status === "CLOSED" ? "final" : "current") : "upcoming",
  }));

  const move = useAction(
    (status: ContainerStatus) =>
      api(`/containers/${container.id}/status`, { method: "POST", body: { status } }),
    { success: (_, status) => `${container.containerRef}: ${CONTAINER_STATUS[status].label}` },
  );

  return (
    <SectionCard title="Status">
      <Stepper steps={steps} minStepWidth={96} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm font-medium text-fg-secondary">
          {next.length ? "Next move" : "Closed. No further moves."}
        </span>
        {next.map((status) => {
          const { label, icon: Icon } = MOVE[status];
          return (
            <Button key={status} disabled={move.isPending} onClick={() => move.mutate(status)}>
              <Icon />
              {label}
            </Button>
          );
        })}
      </div>
      <ErrorMessage error={move.error} />
    </SectionCard>
  );
}

const allocateSchema = z.object({ orderId: requiredText("Choose an order.") });

/** Which orders share the box, and adding more while it's open. */
export function AllocationsCard({ container }: { container: Container }) {
  const open = container.status === "OPEN_FOR_ALLOCATION";
  const clientCount = new Set(container.allocations.map((a) => a.order.client.id)).size;

  const candidates = useQuery({
    ...orders.list({ status: "SHIPMENT_BOOKING", limit: 100 }),
    enabled: open,
  });
  const allocatedIds = new Set(container.allocations.map((a) => a.order.id));

  const form = useForm<z.infer<typeof allocateSchema>>({
    resolver: zodResolver(allocateSchema),
    defaultValues: { orderId: "" },
  });

  const allocate = useAction(
    ({ orderId }: { orderId: string }) =>
      api(`/containers/${container.id}/allocations`, { method: "POST", body: { orderId } }),
    { success: "Order allocated", onDone: () => form.reset({ orderId: "" }) },
  );

  const remove = useAction(
    (allocationId: string) =>
      api(`/containers/${container.id}/allocations/${allocationId}`, { method: "DELETE" }),
    { success: "Order removed from the container" },
  );

  return (
    <SectionCard
      title="Allocated orders"
      description={`${container.allocations.length} ${container.allocations.length === 1 ? "order" : "orders"} · ${clientCount} ${clientCount === 1 ? "client" : "clients"}`}
      flush
    >
      <Table style={{ minWidth: 680 }}>
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
            <TableHead>Order status</TableHead>
            <TableHead className="text-right">CBM</TableHead>
            <TableHead className="text-right">Weight</TableHead>
            <TableHead>
              <span className="sr-only">Remove</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {container.allocations.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-6 text-center text-fg-secondary">
                Nothing allocated yet.
              </TableCell>
            </TableRow>
          )}
          {container.allocations.map((allocation, index) => (
            <TableRow key={allocation.id}>
              <TableCell className="whitespace-nowrap">
                <span
                  className={cn(
                    "mr-2 inline-block size-2 rounded-[2px] align-middle",
                    SERIES[index % SERIES.length],
                  )}
                />
                <Link
                  href={`/manager/orders/${allocation.order.id}`}
                  className="font-medium text-fg hover:text-link"
                >
                  {allocation.order.client.companyName}
                </Link>{" "}
                <span className="font-mono text-xs text-fg-tertiary">
                  {shortId(allocation.order.id)}
                </span>
              </TableCell>
              <TableCell>
                <OrderStatusBadge status={allocation.order.status} size="sm" />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {decimal(allocation.allocatedCbm, 2)}
              </TableCell>
              <TableCell className="text-right whitespace-nowrap tabular-nums">
                {decimal(allocation.allocatedWeightKg, 0)} kg
              </TableCell>
              <TableCell className="text-right">
                {open ? (
                  <Button
                    variant="destructive-ghost"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(allocation.id)}
                  >
                    <XIcon />
                    Remove
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-disabled
                        className="cursor-not-allowed text-fg-disabled hover:bg-transparent hover:text-fg-disabled"
                      >
                        <LockIcon />
                        Remove
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Allocations are locked once the container is booked</TooltipContent>
                  </Tooltip>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2} className="text-fg-secondary">
              Total allocated
            </TableCell>
            <TableCell className="text-right">
              {decimal(container.utilization.allocatedCbm, 2)}
            </TableCell>
            <TableCell className="text-right whitespace-nowrap">
              {decimal(container.utilization.allocatedWeightKg, 0)} kg
            </TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>

      <div className="flex flex-col gap-2 border-t border-divider px-4 py-3.5">
        <ErrorMessage error={remove.error} />
        {open ? (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((values) => allocate.mutate(values))}
              className="flex flex-col gap-2"
              noValidate
            >
              <FormField
                control={form.control}
                name="orderId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Allocate an order</FormLabel>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-[420px] max-w-full">
                            <SelectValue placeholder="Choose an order waiting for a container" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {candidates.data?.data
                            .filter((order) => !allocatedIds.has(order.id))
                            .map((order) => (
                              <SelectItem key={order.id} value={order.id}>
                                <span className="font-mono text-xs">{shortId(order.id)}</span> ·{" "}
                                {order.client.companyName} · {order._count.items} items
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Button type="submit" disabled={allocate.isPending}>
                        <PlusIcon />
                        Allocate
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <ErrorMessage error={allocate.error} />
              <span className="text-xs text-fg-secondary">
                Only orders at Shipment booking are listed. The whole order goes in: its full volume
                and weight.
              </span>
            </form>
          </Form>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Select disabled>
              <SelectTrigger className="w-[360px] max-w-full" aria-describedby="alloc-locked">
                <SelectValue placeholder="Allocate an order" />
              </SelectTrigger>
            </Select>
            <span id="alloc-locked" className="inline-flex items-center gap-1.5 text-sm text-fg-secondary">
              <LockIcon className="size-3.5" />
              Allocations are locked once the container is booked.
            </span>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

const legSchema = z.object({ port: requiredText("Choose a port.") });

/** Stops between origin and destination, for boxes routed via transit. */
export function TransitLegsCard({ container }: { container: Container }) {
  // Stops are planned before the box sails.
  const plannable =
    container.status === "OPEN_FOR_ALLOCATION" || container.status === "FULLY_ALLOCATED";
  const form = useForm<z.infer<typeof legSchema>>({
    resolver: zodResolver(legSchema),
    defaultValues: { port: TRANSIT_PORTS[0] },
  });

  const add = useAction(
    ({ port }: { port: string }) =>
      api(`/containers/${container.id}/transit-legs`, { method: "POST", body: { port } }),
    { success: (_, { port }) => `${port} added as a transit stop` },
  );

  const record = useAction(
    ({ legId, event }: { legId: string; event: "arrival" | "departure" }) =>
      api(`/containers/${container.id}/transit-legs/${legId}/${event}`, {
        method: "POST",
        body: {},
      }),
    { success: (_, { event }) => (event === "arrival" ? "Arrival recorded" : "Departure recorded") },
  );

  return (
    <SectionCard
      title="Transit legs"
      description={`${container.originPort} → ${container.destinationPort}`}
      flush
    >
      {container.routeType === "DIRECT" ? (
        <div className="flex items-center gap-2.5 px-4 py-5 text-sm text-fg-secondary">
          <ArrowRightIcon className="size-4" />
          Direct route: no transit stops to record.
        </div>
      ) : (
        <>
          <Table style={{ minWidth: 460 }}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 text-right">#</TableHead>
                <TableHead>Port</TableHead>
                <TableHead>Arrived</TableHead>
                <TableHead>Departed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {container.transitLegs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-5 text-center text-fg-secondary">
                    No transit stops planned.
                  </TableCell>
                </TableRow>
              )}
              {container.transitLegs.map((leg) => (
                <TableRow key={leg.id}>
                  <TableCell className="text-right text-fg-tertiary tabular-nums">
                    {leg.sequence}
                  </TableCell>
                  <TableCell className="font-medium">{leg.port}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {leg.arrivedAt ? (
                      date(leg.arrivedAt)
                    ) : container.status === "DEPARTED" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={record.isPending}
                        onClick={() => record.mutate({ legId: leg.id, event: "arrival" })}
                      >
                        Record arrival
                      </Button>
                    ) : (
                      <span className="text-fg-tertiary">—</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {leg.departedAt ? (
                      date(leg.departedAt)
                    ) : leg.arrivedAt ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={record.isPending}
                        onClick={() => record.mutate({ legId: leg.id, event: "departure" })}
                      >
                        Record departure
                      </Button>
                    ) : (
                      <span className="text-fg-tertiary">After arrival</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ErrorMessage error={record.error} className="m-4" />

          {plannable && (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((values) => add.mutate(values))}
              className="flex flex-wrap items-end gap-2 border-t border-divider bg-subtle px-4 py-3"
              noValidate
            >
              <FormField
                control={form.control}
                name="port"
                render={({ field }) => (
                  <FormItem className="min-w-[200px] flex-1">
                    <FormLabel>Add a transit stop</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TRANSIT_PORTS.map((port) => (
                          <SelectItem key={port} value={port}>
                            {port}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" variant="outline" disabled={add.isPending}>
                <PlusIcon />
                Add stop
              </Button>
            </form>
          </Form>
          )}
          <ErrorMessage error={add.error} className="m-4" />
        </>
      )}
    </SectionCard>
  );
}

/** Papers for the box itself: master B/L, loading plan, seal record. */
export function ContainerDocumentsCard({ containerId }: { containerId: string }) {
  const [uploading, setUploading] = useState(false);
  const list = useQuery(documents.list({ containerId }));

  return (
    <SectionCard
      title="Container documents"
      flush
      action={
        <Button variant="outline" size="sm" onClick={() => setUploading((open) => !open)}>
          {uploading ? <XIcon /> : <UploadIcon />}
          {uploading ? "Close" : "Upload"}
        </Button>
      }
    >
      <Collapse open={uploading} className="border-b border-divider bg-subtle p-4">
        <UploadDocumentForm
          containerId={containerId}
          current={list.data?.data ?? []}
          onDone={() => setUploading(false)}
        />
      </Collapse>
      <QueryState query={list} loading={<LoadingLines rows={3} />}>
        {({ data }) => <DocumentList documents={data} />}
      </QueryState>
    </SectionCard>
  );
}
