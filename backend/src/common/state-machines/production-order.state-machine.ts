import { ProductionOrderStatus } from '@prisma/client';

import { StateMachine } from './state-machine';

/**
 * Factory-side progress for one production order.
 *
 * This is a supporting lifecycle, not one of the two on the state diagram: it
 * tracks what the supplier is doing between ORDER_CONFIRMED and
 * GOODS_RECEIVED on the parent order. It is linear — a batch cannot go back
 * into production once received — with cancellation available until then.
 */
export const PRODUCTION_ORDER_TRANSITIONS: Readonly<
  Record<ProductionOrderStatus, readonly ProductionOrderStatus[]>
> = {
  [ProductionOrderStatus.PENDING]: [
    ProductionOrderStatus.IN_PRODUCTION,
    ProductionOrderStatus.CANCELLED,
  ],
  [ProductionOrderStatus.IN_PRODUCTION]: [
    ProductionOrderStatus.READY,
    ProductionOrderStatus.CANCELLED,
  ],
  [ProductionOrderStatus.READY]: [
    ProductionOrderStatus.RECEIVED,
    ProductionOrderStatus.CANCELLED,
  ],
  [ProductionOrderStatus.RECEIVED]: [],
  [ProductionOrderStatus.CANCELLED]: [],
};

export const productionOrderStateMachine =
  new StateMachine<ProductionOrderStatus>(
    'Production order',
    PRODUCTION_ORDER_TRANSITIONS,
  );
