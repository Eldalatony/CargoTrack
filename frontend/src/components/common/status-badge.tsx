import {
  CheckIcon,
  CircleAlertIcon,
  LockIcon,
  RotateCwIcon,
  XIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type {
  ContainerStatus,
  NotificationStatus,
  OrderStatus,
} from "@/lib/api/types";
import {
  CONTAINER_STATUS,
  NOTIFICATION_STATUS,
  ORDER_STATUS,
  statusMeta,
  type Marker,
  type StatusMeta,
} from "@/lib/status";
import { cn } from "@/lib/utils";

const ICONS: Partial<Record<Marker, typeof CheckIcon>> = {
  check: CheckIcon,
  x: XIcon,
  alert: CircleAlertIcon,
  lock: LockIcon,
  spin: RotateCwIcon,
};

/** The glyph in front of a status: a ring, a dot, or an icon. */
function StatusMarker({ marker }: { marker: Marker }) {
  const Icon = ICONS[marker];
  if (Icon) {
    return <Icon aria-hidden strokeWidth={2.5} />;
  }
  if (marker === "none") {
    return null;
  }
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full in-data-[size=default]:size-[7px]",
        marker === "ring" ? "border-[1.5px] border-current opacity-70" : "bg-current opacity-80",
      )}
    />
  );
}

export function StatusBadge({
  meta,
  size = "default",
  className,
}: {
  meta: StatusMeta;
  size?: "sm" | "default";
  className?: string;
}) {
  return (
    <Badge tone={meta.tone} size={size} data-size={size} className={className}>
      <StatusMarker marker={meta.marker} />
      {meta.label}
    </Badge>
  );
}

export function OrderStatusBadge({
  status,
  ...props
}: { status: OrderStatus; size?: "sm" | "default"; className?: string }) {
  return <StatusBadge meta={ORDER_STATUS[status]} {...props} />;
}

export function ContainerStatusBadge({
  status,
  ...props
}: { status: ContainerStatus; size?: "sm" | "default"; className?: string }) {
  return <StatusBadge meta={CONTAINER_STATUS[status]} {...props} />;
}

export function NotificationStatusBadge({
  status,
  ...props
}: {
  status: NotificationStatus;
  size?: "sm" | "default";
  className?: string;
}) {
  return <StatusBadge meta={NOTIFICATION_STATUS[status]} {...props} />;
}

/** For history rows, where the status may belong to an order or a container. */
export function AnyStatusBadge({
  status,
  ...props
}: { status: string; size?: "sm" | "default"; className?: string }) {
  return <StatusBadge meta={statusMeta(status)} {...props} />;
}
