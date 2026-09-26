import type {
  ContainerStatus,
  NotificationStatus,
  OrderStatus,
  ProductionOrderStatus,
  QcOutcome,
} from "./api/types";

/**
 * How each status looks. Marker + colour + text, never colour alone:
 * the tone picks the chip colours, the marker the glyph in front.
 */
export type Tone =
  | "neutral"
  | "info"
  | "brand"
  | "brand-soft"
  | "success"
  | "final"
  | "void"
  | "danger"
  | "danger-solid"
  | "warning"
  | "sunken";

export type Marker =
  | "ring"
  | "dot"
  | "check"
  | "x"
  | "alert"
  | "lock"
  | "spin"
  | "none";

export interface StatusMeta {
  label: string;
  tone: Tone;
  marker: Marker;
}

export const ORDER_STATUS: Record<OrderStatus, StatusMeta> = {
  ORDER_PLACED: { label: "Order placed", tone: "neutral", marker: "ring" },
  ORDER_CONFIRMED: { label: "Order confirmed", tone: "neutral", marker: "dot" },
  GOODS_RECEIVED: { label: "Goods received", tone: "info", marker: "dot" },
  SHIPMENT_BOOKING: { label: "Shipment booking", tone: "info", marker: "dot" },
  ROUTE_DECISION: { label: "Route decision", tone: "info", marker: "dot" },
  IN_TRANSIT: { label: "In transit", tone: "brand", marker: "dot" },
  DELIVERED: { label: "Delivered", tone: "success", marker: "dot" },
  CLOSED_OUT: { label: "Closed out", tone: "final", marker: "check" },
  CANCELLED: { label: "Cancelled", tone: "void", marker: "x" },
  FACTORY_CANNOT_FULFIL: {
    label: "Factory cannot fulfil",
    tone: "danger",
    marker: "alert",
  },
  QC_REJECTED: { label: "QC rejected", tone: "danger", marker: "alert" },
  DOCUMENTS_WITHHELD: {
    label: "Documents withheld",
    tone: "warning",
    marker: "lock",
  },
};

/** Plain-language step names for the client's timeline. */
export const ORDER_STATUS_FOR_CLIENT: Record<OrderStatus, string> = {
  ORDER_PLACED: "Order placed",
  ORDER_CONFIRMED: "Order confirmed",
  GOODS_RECEIVED: "Received at our warehouse",
  SHIPMENT_BOOKING: "Space booked on a ship",
  ROUTE_DECISION: "Route chosen",
  IN_TRANSIT: "On the ship",
  DELIVERED: "Handed over to you",
  CLOSED_OUT: "All settled",
  CANCELLED: "Cancelled",
  FACTORY_CANNOT_FULFIL: "The factory can't make it",
  QC_REJECTED: "Failed the quality check",
  DOCUMENTS_WITHHELD: "Pay to release your documents",
};

/** What the office should do next, shown in the order's right rail. */
export const ORDER_NEXT_ACTION: Record<OrderStatus, string> = {
  ORDER_PLACED: "Confirm the order once the deposit is in.",
  ORDER_CONFIRMED:
    "Wait for the goods to reach the warehouse, then mark them received.",
  GOODS_RECEIVED: "Book space on a vessel for this cargo.",
  SHIPMENT_BOOKING: "Decide the route for this shipment.",
  ROUTE_DECISION: "Mark the order in transit when the vessel sails.",
  IN_TRANSIT: "Mark delivered once the client has the goods.",
  DELIVERED: "Balance is paid. Close out the order.",
  DOCUMENTS_WITHHELD: "Balance is paid. Close out the order.",
  FACTORY_CANNOT_FULFIL:
    "Find another supplier, then move the order back to Order placed.",
  QC_REJECTED: "Decide whether to close out or cancel the order.",
  CLOSED_OUT: "Nothing left to do. This order is closed out.",
  CANCELLED: "This order was cancelled. No further moves.",
};

export const CONTAINER_STATUS: Record<ContainerStatus, StatusMeta> = {
  OPEN_FOR_ALLOCATION: {
    label: "Open for allocation",
    tone: "neutral",
    marker: "ring",
  },
  FULLY_ALLOCATED: { label: "Fully allocated", tone: "info", marker: "dot" },
  DEPARTED: { label: "Departed", tone: "brand", marker: "dot" },
  ARRIVED: { label: "Arrived", tone: "success", marker: "dot" },
  CLOSED: { label: "Closed", tone: "final", marker: "check" },
};

export const NOTIFICATION_STATUS: Record<NotificationStatus, StatusMeta> = {
  PENDING: { label: "Pending", tone: "neutral", marker: "ring" },
  RETRYING: { label: "Retrying", tone: "info", marker: "spin" },
  FAILED: { label: "Failed", tone: "warning", marker: "alert" },
  DEAD_LETTER: { label: "Dead letter", tone: "danger-solid", marker: "x" },
  SENT: { label: "Sent", tone: "success", marker: "check" },
};

export const PRODUCTION_STATUS: Record<ProductionOrderStatus, StatusMeta> = {
  PENDING: { label: "Ordered", tone: "sunken", marker: "none" },
  IN_PRODUCTION: { label: "In production", tone: "info", marker: "none" },
  READY: { label: "Ready", tone: "brand-soft", marker: "none" },
  RECEIVED: { label: "Received", tone: "success", marker: "none" },
  CANCELLED: { label: "Cancelled", tone: "void", marker: "none" },
};

export const QC_OUTCOME: Record<QcOutcome, StatusMeta> = {
  PASSED: { label: "Passed", tone: "success", marker: "none" },
  PARTIAL: { label: "Partial", tone: "warning", marker: "none" },
  REJECTED: { label: "Rejected", tone: "danger", marker: "none" },
};

/** Any status string from the history tables, whatever entity it belongs to. */
export function statusMeta(status: string): StatusMeta {
  return (
    ORDER_STATUS[status as OrderStatus] ??
    CONTAINER_STATUS[status as ContainerStatus] ?? {
      label: status,
      tone: "neutral",
      marker: "dot",
    }
  );
}
