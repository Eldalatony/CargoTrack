"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ErrorMessage } from "@/components/ui/error-message";
import { Field } from "@/components/ui/field";
import { QueryState } from "@/components/ui/query-state";
import { api } from "@/lib/api/client";
import type {
  Notification,
  NotificationStatus,
  Paginated,
} from "@/lib/api/types";
import { dateTime, label } from "@/lib/format";
import { useAction } from "@/lib/use-action";

const STATUSES: NotificationStatus[] = [
  "PENDING",
  "RETRYING",
  "FAILED",
  "DEAD_LETTER",
  "SENT",
];

/**
 * The notification pipeline from the office's side. DEAD_LETTER rows have
 * used all 5 attempts; each shows how many and the last error, and can be
 * re-queued once the cause is fixed.
 */
export default function NotificationsPage() {
  const [status, setStatus] = useState<NotificationStatus | "">("DEAD_LETTER");
  const [page, setPage] = useState(1);

  const summary = useQuery({
    queryKey: ["notification-summary"],
    queryFn: () =>
      api<Record<NotificationStatus, number>>("/notifications/summary"),
    refetchInterval: 5000,
  });

  const notifications = useQuery({
    queryKey: ["notifications", status, page],
    queryFn: () =>
      api<Paginated<Notification>>(
        `/notifications?page=${page}&limit=50${status ? `&status=${status}` : ""}`,
      ),
    refetchInterval: 5000,
  });

  const retry = useAction((id: string) =>
    api(`/notifications/${id}/retry`, { method: "POST" }),
  );

  return (
    <>
      <h1>Notifications</h1>

      <QueryState query={summary}>
        {(counts) => (
          <table>
            <thead>
              <tr>
                {STATUSES.map((value) => (
                  <th key={value}>{label(value)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {STATUSES.map((value) => (
                  <td key={value}>{counts[value]}</td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
      </QueryState>

      <Field label="Show">
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as NotificationStatus | "");
            setPage(1);
          }}
        >
          <option value="">All</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {label(value)}
            </option>
          ))}
        </select>
      </Field>

      <ErrorMessage error={retry.error} />

      <QueryState query={notifications}>
        {({ data, meta }) => (
          <>
            <table>
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Event</th>
                  <th>Recipient</th>
                  <th>Channel</th>
                  <th>Status</th>
                  <th>Attempts failed</th>
                  <th>Last error</th>
                  <th>Sent</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 && (
                  <tr>
                    <td colSpan={9}>Nothing here.</td>
                  </tr>
                )}
                {data.map((row) => (
                  <tr key={row.id} data-status={row.status}>
                    <td>{dateTime(row.createdAt)}</td>
                    <td>{row.eventType}</td>
                    <td>
                      {label(row.recipientType)}{" "}
                      {row.clientVisible ? "" : "(internal)"}
                    </td>
                    <td>{label(row.channel)}</td>
                    <td>{label(row.status)}</td>
                    <td>{row.retryCount}</td>
                    <td>{row.lastError ?? ""}</td>
                    <td>{dateTime(row.sentAt)}</td>
                    <td>
                      {row.status === "DEAD_LETTER" && (
                        <button
                          type="button"
                          disabled={retry.isPending}
                          onClick={() => retry.mutate(row.id)}
                        >
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Page {meta.page} of {meta.totalPages}{" "}
              <button
                type="button"
                disabled={meta.page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>{" "}
              <button
                type="button"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </p>
          </>
        )}
      </QueryState>
    </>
  );
}
