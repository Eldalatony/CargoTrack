import { StockStatus } from '@prisma/client';

import { StateMachine } from './state-machine';

/**
 * Goods sitting in a warehouse.
 *
 * A supporting lifecycle, like production orders: it is not on the state
 * diagram, but it is audited the same way. Holds are the interesting part —
 * the office parks stock for seasonal reasons (a client waiting out Ramadan
 * demand, a customs slowdown), so a hold can be lifted back to IN_STOCK
 * without the goods ever leaving. RELEASED means they left, and is final.
 */
export const STOCK_RECORD_TRANSITIONS: Readonly<
  Record<StockStatus, readonly StockStatus[]>
> = {
  [StockStatus.IN_STOCK]: [StockStatus.ON_HOLD, StockStatus.RELEASED],
  [StockStatus.ON_HOLD]: [StockStatus.IN_STOCK, StockStatus.RELEASED],
  [StockStatus.RELEASED]: [],
};

export const stockRecordStateMachine = new StateMachine<StockStatus>(
  'Stock record',
  STOCK_RECORD_TRANSITIONS,
);
