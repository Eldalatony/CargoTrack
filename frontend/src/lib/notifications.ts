import type { NotificationStatus } from "./api/types";
import { label } from "./format";
import { statusMeta } from "./status";

export const NOTIFICATION_ORDER: NotificationStatus[] = [
  "PENDING",
  "RETRYING",
  "FAILED",
  "DEAD_LETTER",
  "SENT",
];

/** Each message is tried this many times before it's dead-lettered. */
export const MAX_ATTEMPTS = 5;

const ENTITY_LABELS: Record<string, string> = { QC: "QC", QC_INSPECTION: "QC inspection" };

/** "ORDER.IN_TRANSIT" -> "Order: In transit"; "ORDER.ORDER_PLACED" -> "Order: Placed" */
export function describeEvent(eventType: string) {
  const [entity, status] = eventType.split(".");
  const entityLabel = ENTITY_LABELS[entity] ?? label(entity);
  if (!status) {
    return entityLabel;
  }
  const meta = statusMeta(status);
  let statusLabel = (meta.label === status ? label(status) : meta.label).replace(/signoff/i, "sign-off");
  // "Order: Order placed" says "Order" twice.
  if (statusLabel.toLowerCase().startsWith(entityLabel.toLowerCase() + " ")) {
    const rest = statusLabel.slice(entityLabel.length + 1);
    statusLabel = rest.charAt(0).toUpperCase() + rest.slice(1);
  }
  return `${entityLabel}: ${statusLabel}`;
}

/** "EMAIL" -> "Email", "IN_APP" -> "In-app", "SMS" -> "SMS" */
export function channelLabel(channel: string) {
  if (channel === "SMS") return "SMS";
  if (channel === "IN_APP") return "In-app";
  return label(channel);
}

export const STATUS_SUB: Record<NotificationStatus, (count: number) => string> = {
  PENDING: (n) => (n ? "Queued to send" : "Queue is empty"),
  RETRYING: (n) => (n ? "Sending again now" : "Nothing retrying"),
  FAILED: (n) => (n ? "Will retry automatically" : "No failures"),
  DEAD_LETTER: (n) => (n ? `Gave up after ${MAX_ATTEMPTS} tries · needs you` : "Nothing stuck"),
  SENT: () => "Delivered",
};
