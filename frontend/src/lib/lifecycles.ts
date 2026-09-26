import type {
  ContainerStatus,
  OrderStatus,
  ProductionOrderStatus,
} from "./api/types";

/**
 * Which moves to offer as buttons. A copy of the server's transition tables
 * for display only — the server enforces them, and anything it refuses
 * (a guard, a precondition) comes back as an error shown next to the button.
 */
export const ORDER_NEXT: Record<OrderStatus, OrderStatus[]> = {
  ORDER_PLACED: ["ORDER_CONFIRMED", "CANCELLED"],
  ORDER_CONFIRMED: ["GOODS_RECEIVED", "FACTORY_CANNOT_FULFIL"],
  GOODS_RECEIVED: ["SHIPMENT_BOOKING", "QC_REJECTED"],
  SHIPMENT_BOOKING: ["ROUTE_DECISION"],
  ROUTE_DECISION: ["IN_TRANSIT"],
  IN_TRANSIT: ["DELIVERED"],
  DELIVERED: ["CLOSED_OUT", "DOCUMENTS_WITHHELD"],
  CLOSED_OUT: [],
  CANCELLED: [],
  FACTORY_CANNOT_FULFIL: ["ORDER_PLACED", "CANCELLED"],
  QC_REJECTED: ["CANCELLED", "CLOSED_OUT"],
  DOCUMENTS_WITHHELD: ["CLOSED_OUT"],
};

/** Exception branches: the server wants a reason, so the UI asks for one. */
export const ORDER_EXCEPTIONS: OrderStatus[] = [
  "CANCELLED",
  "FACTORY_CANNOT_FULFIL",
  "QC_REJECTED",
  "DOCUMENTS_WITHHELD",
];

/** The happy path, in order — drawn as the client's shipment timeline. */
export const ORDER_HAPPY_PATH: OrderStatus[] = [
  "ORDER_PLACED",
  "ORDER_CONFIRMED",
  "GOODS_RECEIVED",
  "SHIPMENT_BOOKING",
  "ROUTE_DECISION",
  "IN_TRANSIT",
  "DELIVERED",
  "CLOSED_OUT",
];

export const ALL_ORDER_STATUSES = Object.keys(ORDER_NEXT) as OrderStatus[];

export const PRODUCTION_NEXT: Record<
  ProductionOrderStatus,
  ProductionOrderStatus[]
> = {
  PENDING: ["IN_PRODUCTION", "CANCELLED"],
  IN_PRODUCTION: ["READY", "CANCELLED"],
  READY: ["RECEIVED", "CANCELLED"],
  RECEIVED: [],
  CANCELLED: [],
};

export const CONTAINER_NEXT: Record<ContainerStatus, ContainerStatus[]> = {
  OPEN_FOR_ALLOCATION: ["FULLY_ALLOCATED"],
  FULLY_ALLOCATED: ["DEPARTED"],
  DEPARTED: ["ARRIVED"],
  ARRIVED: ["CLOSED"],
  CLOSED: [],
};

/**
 * The happy-path step each exception branches off from, so it can be drawn
 * in the right place even when the history doesn’t record every step.
 */
export const EXCEPTION_AFTER: Partial<Record<OrderStatus, OrderStatus>> = {
  FACTORY_CANNOT_FULFIL: "ORDER_CONFIRMED",
  QC_REJECTED: "GOODS_RECEIVED",
  DOCUMENTS_WITHHELD: "DELIVERED",
};
