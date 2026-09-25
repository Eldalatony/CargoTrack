"use client";

import { useQuery } from "@tanstack/react-query";

import { QueryState } from "@/components/ui/query-state";
import { api } from "@/lib/api/client";
import type { Notification, Paginated } from "@/lib/api/types";
import { dateTime, label } from "@/lib/format";

/** Messages sent to this client. The API returns only their own. */
export default function PortalNotificationsPage() {
  const notifications = useQuery({
    queryKey: ["notifications", "mine"],
    queryFn: () => api<Paginated<Notification>>("/notifications?limit=100"),
  });

  return (
    <>
      <h1>Messages</h1>
      <QueryState query={notifications}>
        {({ data }) =>
          data.length === 0 ? (
            <p>No messages.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Update</th>
                  <th>Channel</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.id}>
                    <td>{dateTime(row.createdAt)}</td>
                    <td>{describe(row.eventType)}</td>
                    <td>{label(row.channel)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </QueryState>
    </>
  );
}

/** ORDER.IN_TRANSIT -> "Order: In transit" */
function describe(eventType: string) {
  const [entity, status] = eventType.split(".");
  return `${label(entity)}: ${label(status)}`;
}
