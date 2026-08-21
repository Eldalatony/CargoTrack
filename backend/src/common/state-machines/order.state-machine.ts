import { OrderStatus } from '@prisma/client';

import { StateMachine } from './state-machine';

/**
 * The order lifecycle from Information/Cargo_Track_StateDiagram.png (left
 * panel): 8 states on the happy path plus 4 exception branches.
 *
 * Read the table as the diagram reads:
 *
 *   ORDER_PLACED → ORDER_CONFIRMED → GOODS_RECEIVED → SHIPMENT_BOOKING
 *                → ROUTE_DECISION  → IN_TRANSIT     → DELIVERED → CLOSED_OUT
 *
 * Exception branches and where they rejoin:
 *   CANCELLED             dead end — nothing advances from it.
 *   FACTORY_CANNOT_FULFIL re-source the factory (back to ORDER_PLACED) or give up.
 *   QC_REJECTED           goods returned; cancel, or close out against a refund.
 *   DOCUMENTS_WITHHELD    a stuck state, not a failure — it loops back to
 *                         CLOSED_OUT the moment the final payment clears.
 *
 * ROUTE_DECISION is a fork in the diagram (direct vs. transit route), not a
 * pair of states: both branches rejoin at IN_TRANSIT, and which one was taken
 * is recorded on the container's transit legs in Phase 3.
 */
export const ORDER_TRANSITIONS: Readonly<
  Record<OrderStatus, readonly OrderStatus[]>
> = {
  [OrderStatus.ORDER_PLACED]: [
    OrderStatus.ORDER_CONFIRMED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.ORDER_CONFIRMED]: [
    OrderStatus.GOODS_RECEIVED,
    OrderStatus.FACTORY_CANNOT_FULFIL,
  ],
  [OrderStatus.GOODS_RECEIVED]: [
    OrderStatus.SHIPMENT_BOOKING,
    OrderStatus.QC_REJECTED,
  ],
  [OrderStatus.SHIPMENT_BOOKING]: [OrderStatus.ROUTE_DECISION],
  [OrderStatus.ROUTE_DECISION]: [OrderStatus.IN_TRANSIT],
  [OrderStatus.IN_TRANSIT]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [
    OrderStatus.CLOSED_OUT,
    OrderStatus.DOCUMENTS_WITHHELD,
  ],
  [OrderStatus.CLOSED_OUT]: [],

  [OrderStatus.CANCELLED]: [],
  [OrderStatus.FACTORY_CANNOT_FULFIL]: [
    OrderStatus.ORDER_PLACED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.QC_REJECTED]: [OrderStatus.CANCELLED, OrderStatus.CLOSED_OUT],
  [OrderStatus.DOCUMENTS_WITHHELD]: [OrderStatus.CLOSED_OUT],
};

export const orderStateMachine = new StateMachine<OrderStatus>(
  'Order',
  ORDER_TRANSITIONS,
);

/**
 * The 8 happy-path states in order. This is the walk Gate 2 is verified
 * against, and the same sequence the seed writes for the closed-out demo
 * order — so the fixture and the rule cannot drift apart.
 */
export const ORDER_HAPPY_PATH: readonly OrderStatus[] = [
  OrderStatus.ORDER_PLACED,
  OrderStatus.ORDER_CONFIRMED,
  OrderStatus.GOODS_RECEIVED,
  OrderStatus.SHIPMENT_BOOKING,
  OrderStatus.ROUTE_DECISION,
  OrderStatus.IN_TRANSIT,
  OrderStatus.DELIVERED,
  OrderStatus.CLOSED_OUT,
];

/** Statuses at which an order is no longer commercially open. */
export const ORDER_FINAL_STATUSES: readonly OrderStatus[] = [
  OrderStatus.CLOSED_OUT,
  OrderStatus.CANCELLED,
];
