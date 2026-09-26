"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellIcon,
  CheckIcon,
  CircleCheckIcon,
  ClockIcon,
  InboxIcon,
  LoaderIcon,
  MailIcon,
  MailXIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  RotateCwIcon,
  TriangleAlertIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorMessage } from "@/components/common/error-message";
import { Pagination } from "@/components/common/pagination";
import { LoadingLines, QueryState } from "@/components/common/query-state";
import { StatTile } from "@/components/common/stat-tile";
import { NotificationStatusBadge } from "@/components/common/status-badge";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Crossfade, Stagger, StaggerItem } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
import { api } from "@/lib/api/client";
import { notifications } from "@/lib/api/queries";
import type { Notification, NotificationStatus } from "@/lib/api/types";
import { dateTime, label, shortId, time } from "@/lib/format";
import {
  channelLabel,
  describeEvent,
  MAX_ATTEMPTS,
  NOTIFICATION_ORDER,
  STATUS_SUB,
} from "@/lib/notifications";
import { NOTIFICATION_STATUS } from "@/lib/status";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";

const ALL = "all";
const PAGE_SIZE = 25;
const LIVE = 5000;

const TILE_ICONS: Record<NotificationStatus, LucideIcon> = {
  PENDING: ClockIcon,
  RETRYING: RotateCwIcon,
  FAILED: TriangleAlertIcon,
  DEAD_LETTER: MailXIcon,
  SENT: CircleCheckIcon,
};

const TILE_ICON_TONE: Record<NotificationStatus, string> = {
  PENDING: "text-fg-tertiary",
  RETRYING: "text-info-solid",
  FAILED: "text-warning-text",
  DEAD_LETTER: "text-danger-solid",
  SENT: "text-success-solid",
};

const CHANNEL_ICONS: Record<string, LucideIcon> = {
  EMAIL: MailIcon,
  SMS: MessageSquareIcon,
  IN_APP: BellIcon,
};

/**
 * The notification pipeline from the office's side. Dead letters have used
 * all 5 attempts; each shows its last error and can be re-queued once the
 * cause is fixed. Refreshes itself every few seconds.
 */
export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<NotificationStatus | "">("");
  const [page, setPage] = useState(1);

  const summary = useQuery({ ...notifications.summary(), refetchInterval: LIVE });
  const list = useQuery({
    ...notifications.list({ page, limit: PAGE_SIZE, status }),
    refetchInterval: LIVE,
  });
  const deadList = useQuery({
    ...notifications.list({ status: "DEAD_LETTER", limit: 100 }),
    refetchInterval: LIVE,
  });

  const retry = useAction(
    (ids: string[]) =>
      Promise.all(ids.map((id) => api(`/notifications/${id}/retry`, { method: "POST" }))),
    {
      success: (_, ids) =>
        ids.length === 1 ? "Queued to send again" : `${ids.length} messages queued to send again`,
    },
  );

  const counts = summary.data;
  const dead = deadList.data?.data ?? [];
  const deadCount = counts?.DEAD_LETTER ?? 0;
  const inFlight = counts ? counts.PENDING + counts.RETRYING + counts.FAILED : 0;

  function filterBy(next: NotificationStatus | "") {
    setStatus(next);
    setPage(1);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Notifications"
        description={`Emails, SMS and in-app messages sent on every status change. Each message is retried up to ${MAX_ATTEMPTS} times, then moved to the dead letter queue.`}
        actions={
          <>
            <span className="inline-flex items-center gap-1.5 text-xs text-fg-secondary">
              <span className="size-2 rounded-full bg-success-solid shadow-[0_0_0_3px_var(--success-soft)]" />
              Live · updated {list.dataUpdatedAt ? time(list.dataUpdatedAt) : "—"}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                queryClient.invalidateQueries({
                  predicate: (query) => String(query.queryKey[0]).startsWith("notification"),
                })
              }
            >
              <RefreshCwIcon />
              Refresh
            </Button>
          </>
        }
      />

      {counts && (
        <Crossfade id={deadCount > 0 ? "dead" : inFlight > 0 ? "flight" : "clear"}>
          {deadCount > 0 ? (
            <HealthBanner
              tone="danger"
              icon={MailXIcon}
              title={
                deadCount === 1
                  ? "1 notification failed permanently"
                  : `${deadCount} notifications failed permanently`
              }
              detail={
                deadCount === 1 && dead[0]
                  ? `${describeEvent(dead[0].eventType)} (${label(dead[0].entityType)} ${shortId(dead[0].entityId)}) was not delivered by ${channelLabel(dead[0].channel)}. It failed ${MAX_ATTEMPTS} times${dead[0].lastError ? `: ${dead[0].lastError}` : ""}. Retry it, or contact the recipient another way.`
                  : `These messages failed ${MAX_ATTEMPTS} times and will not be retried automatically. Retry them, or contact the recipients another way.`
              }
              action={
                <Button
                  size="lg"
                  variant="destructive"
                  disabled={retry.isPending || dead.length === 0}
                  onClick={() => retry.mutate(dead.map((row) => row.id))}
                >
                  <RotateCwIcon />
                  {deadCount === 1 ? "Retry now" : `Retry all ${deadCount}`}
                </Button>
              }
            />
          ) : inFlight > 0 ? (
            <HealthBanner
              tone="info"
              icon={LoaderIcon}
              title={`Delivering ${inFlight === 1 ? "1 message" : `${inFlight} messages`}…`}
              detail="Nothing is stuck. Messages in flight usually clear within a minute."
            />
          ) : (
            <HealthBanner
              tone="success"
              icon={CheckIcon}
              title="All notifications delivered"
              detail={`${counts.SENT} sent. Nothing pending, retrying or stuck. You don’t need to do anything.`}
            />
          )}
        </Crossfade>
      )}
      <ErrorMessage error={retry.error} />

      <Stagger
        role="group"
        aria-label="Status counts"
        className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3"
      >
        {NOTIFICATION_ORDER.map((value) => (
          <StaggerItem key={value}>
            <StatTile
              label={NOTIFICATION_STATUS[value].label}
              icon={TILE_ICONS[value]}
              iconClassName={TILE_ICON_TONE[value]}
              count={counts?.[value]}
              sub={STATUS_SUB[value](counts?.[value] ?? 0)}
              alarm={value === "DEAD_LETTER" && deadCount > 0}
              active={status === value}
              onClick={() => filterBy(status === value ? "" : value)}
            />
          </StaggerItem>
        ))}
      </Stagger>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-divider px-4 py-3">
          <Label htmlFor="n-filter" className="text-fg-secondary">
            Status
          </Label>
          <Select
            value={status || ALL}
            onValueChange={(value) => filterBy(value === ALL ? "" : (value as NotificationStatus))}
          >
            <SelectTrigger id="n-filter" size="sm" className="w-[220px] max-w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {NOTIFICATION_ORDER.map((value) => (
                <SelectItem key={value} value={value}>
                  {NOTIFICATION_STATUS[value].label}
                  {counts && ` (${counts[value]})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {status && (
            <Button variant="ghost" size="sm" className="text-link" onClick={() => filterBy("")}>
              <XIcon />
              Clear filter
            </Button>
          )}
          <span className="flex-1" />
          <span className="text-xs text-fg-tertiary">Newest first</span>
        </div>

        <QueryState query={list} loading={<LoadingLines rows={8} />}>
          {({ data, meta }) => (
            <>
              <Table style={{ minWidth: 960 }}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Created</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Attempts failed</TableHead>
                    <TableHead>Last error</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead className="sticky right-0 z-[1] shadow-[inset_1px_0_0_var(--border-subtle)]">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 && (
                    <tr>
                      <td colSpan={9} className="border-b border-divider">
                        <EmptyState
                          icon={status && status !== "SENT" ? CheckIcon : InboxIcon}
                          tone={status && status !== "SENT" ? "success" : "neutral"}
                          title="Nothing here"
                          description={
                            status && status !== "SENT"
                              ? `No messages are ${NOTIFICATION_STATUS[status].label.toLowerCase()}. That’s good: nothing needs attention here.`
                              : "No notifications yet. They appear here as soon as an order or container changes status."
                          }
                          action={
                            status ? (
                              <Button variant="outline" size="sm" onClick={() => filterBy("")}>
                                Show all messages
                              </Button>
                            ) : undefined
                          }
                        />
                      </td>
                    </tr>
                  )}
                  {data.map((row) => (
                    <NotificationRow
                      key={row.id}
                      row={row}
                      retrying={retry.isPending}
                      onRetry={() => retry.mutate([row.id])}
                    />
                  ))}
                </TableBody>
              </Table>
              <Pagination
                page={meta.page}
                totalPages={meta.totalPages}
                onPage={setPage}
                summary={`${meta.total} ${meta.total === 1 ? "message" : "messages"}`}
              />
            </>
          )}
        </QueryState>
      </Card>
    </PageContainer>
  );
}

function HealthBanner({
  tone,
  icon: Icon,
  title,
  detail,
  action,
}: {
  tone: "danger" | "info" | "success";
  icon: LucideIcon;
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex flex-wrap items-center gap-3.5 rounded-lg border px-4 py-3.5",
        tone === "danger" && "border-danger-border bg-danger-soft",
        tone === "info" && "border-info-border bg-info-soft",
        tone === "success" && "border-success-border bg-success-soft",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          tone === "danger" && "bg-danger-solid text-on-danger",
          tone === "info" && "bg-info-solid text-on-info",
          tone === "success" && "bg-success-solid text-on-success",
        )}
      >
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-[1_1_320px]">
        <div
          className={cn(
            "text-lg font-semibold",
            tone === "danger" && "text-danger-text",
            tone === "info" && "text-info-text",
            tone === "success" && "text-success-text",
          )}
        >
          {title}
        </div>
        <div className="mt-0.5 text-sm text-pretty">{detail}</div>
      </div>
      {action}
    </div>
  );
}

function AttemptPips({ failed, dead }: { failed: number; dead: boolean }) {
  return (
    <span className="inline-flex gap-0.5" aria-hidden>
      {Array.from({ length: MAX_ATTEMPTS }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-2.5 w-1.5 rounded-[1px]",
            index < failed ? (dead ? "bg-danger-solid" : "bg-warning-solid") : "bg-sunken",
          )}
        />
      ))}
    </span>
  );
}

function NotificationRow({
  row,
  retrying,
  onRetry,
}: {
  row: Notification;
  retrying: boolean;
  onRetry: () => void;
}) {
  const dead = row.status === "DEAD_LETTER";
  const resolved = row.status === "SENT" && !!row.lastError;
  const ChannelIcon = CHANNEL_ICONS[row.channel] ?? BellIcon;
  const deadBg = "bg-[color-mix(in_oklch,var(--danger-soft)_70%,var(--bg-surface))]";

  return (
    <TableRow className={cn("align-top", dead && deadBg)}>
      <TableCell className="py-2 whitespace-nowrap text-fg-secondary tabular-nums">
        {dateTime(row.createdAt)}
      </TableCell>
      <TableCell className="py-2">
        <div className="font-medium">{describeEvent(row.eventType)}</div>
        <div className="font-mono text-xs text-fg-tertiary">
          {label(row.entityType)} {shortId(row.entityId)}
        </div>
      </TableCell>
      <TableCell className="py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="whitespace-nowrap">{label(row.recipientType)}</span>
          {!row.clientVisible && (
            <span
              title="Internal: sent to office staff"
              className="inline-flex h-[18px] items-center rounded-xs border border-strong px-[5px] text-[10px] font-semibold tracking-overline text-fg-secondary uppercase"
            >
              Internal
            </span>
          )}
        </div>
        <div className="font-mono text-xs text-fg-tertiary">{shortId(row.recipientId)}</div>
      </TableCell>
      <TableCell className="py-2 whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5 text-fg-secondary">
          <ChannelIcon className="size-3.5" />
          {channelLabel(row.channel)}
        </span>
      </TableCell>
      <TableCell className="py-2 whitespace-nowrap">
        <NotificationStatusBadge status={row.status} />
      </TableCell>
      <TableCell className="py-2 text-right whitespace-nowrap">
        <div className="inline-flex items-center gap-2">
          <AttemptPips failed={row.retryCount} dead={dead} />
          <span
            className={cn(
              "inline-block min-w-7 text-right tabular-nums",
              dead ? "font-semibold text-danger-text" : row.retryCount ? "text-fg" : "text-fg-tertiary",
            )}
          >
            {row.retryCount ? `${row.retryCount} / ${MAX_ATTEMPTS}` : "0"}
          </span>
        </div>
      </TableCell>
      <TableCell className="max-w-[260px] py-2">
        {row.lastError ? (
          <span
            className={cn(
              "font-mono text-xs text-pretty",
              resolved ? "text-fg-tertiary" : dead ? "text-danger-text" : "text-fg",
            )}
          >
            {row.lastError}
            {resolved && " · resolved"}
          </span>
        ) : (
          <span className="text-fg-tertiary">—</span>
        )}
      </TableCell>
      <TableCell className="py-2 whitespace-nowrap text-fg-secondary tabular-nums">
        {row.sentAt ? dateTime(row.sentAt) : dead ? "Not delivered" : "—"}
      </TableCell>
      <TableCell
        className={cn(
          "sticky right-0 py-2 text-right whitespace-nowrap",
          dead
            ? cn(deadBg, "shadow-[inset_1px_0_0_var(--danger-border),-8px_0_12px_-8px_oklch(0.17_0.008_250/0.18)]")
            : "bg-surface shadow-[inset_1px_0_0_var(--border-subtle)] [tr:hover>&]:bg-hover",
        )}
      >
        {dead && (
          <Button
            variant="destructive"
            size="sm"
            disabled={retrying}
            aria-label={`Retry ${channelLabel(row.channel)} for ${describeEvent(row.eventType)}`}
            onClick={onRetry}
          >
            <RotateCwIcon />
            Retry
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
