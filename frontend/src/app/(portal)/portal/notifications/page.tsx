"use client";

import { useQuery } from "@tanstack/react-query";
import { BellIcon, InboxIcon, MailIcon, MessageSquareIcon, type LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { QueryState } from "@/components/common/query-state";
import { SectionCard } from "@/components/common/section-card";
import { PageContainer } from "@/components/layout/page";
import { Skeleton } from "@/components/ui/skeleton";
import { notifications } from "@/lib/api/queries";
import { dateTime } from "@/lib/format";
import { channelLabel, describeEvent } from "@/lib/notifications";

const CHANNEL_ICONS: Record<string, LucideIcon> = {
  EMAIL: MailIcon,
  SMS: MessageSquareIcon,
  IN_APP: BellIcon,
};

/** Messages sent to this client. The API returns only their own. */
export default function PortalNotificationsPage() {
  const list = useQuery(notifications.list({ limit: 100 }));

  return (
    <PageContainer narrow className="gap-4">
      <h1 className="m-0 text-3xl font-semibold tracking-tight">Messages</h1>
      <p className="-mt-2 mb-0 text-fg-secondary">
        Every update we’ve sent you about your shipments.
      </p>

      <QueryState
        query={list}
        loading={<Skeleton className="h-64 rounded-lg" />}
      >
        {({ data }) => (
          <SectionCard title="Updates" flush>
            {data.length === 0 ? (
              <EmptyState
                icon={InboxIcon}
                title="No messages yet"
                description="We’ll message you each time one of your shipments moves."
              />
            ) : (
              <ul className="m-0 list-none p-0">
                  {data.map((row) => {
                    const Icon = CHANNEL_ICONS[row.channel] ?? BellIcon;
                    return (
                      <li key={row.id} className="flex items-start gap-3 border-b border-divider px-4 py-3 last:border-b-0">
                          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-subtle text-fg-secondary">
                            <Icon className="size-4" aria-hidden />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium">{describeEvent(row.eventType)}</div>
                            <div className="text-xs text-fg-secondary tabular-nums">
                              {dateTime(row.createdAt)} · by {channelLabel(row.channel)}
                            </div>
                          </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </SectionCard>
        )}
      </QueryState>
    </PageContainer>
  );
}
