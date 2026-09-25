import {
  PaymentDirection,
  PaymentType,
  Prisma,
  PrismaClient,
} from '@prisma/client';

/**
 * Where an order stands with the client's money.
 *
 * This is the one calculation both payment gates on the order state diagram
 * read — deposit before GOODS_RECEIVED, balance before CLOSED_OUT — and the
 * one the document release gate re-reads on every request. Keeping it a pure
 * function over rows means all three agree by construction, and the boundary
 * cases are unit-tested without a database.
 *
 * Only client money counts: DEPOSIT and BALANCE received, less any REFUND
 * paid back, in the order's own currency, and only once `paid_at` is set. An
 * invoice that has been raised but not paid is a promise, not money.
 */
export interface SettlementOrder {
  agreedPrice: Prisma.Decimal;
  depositPercentage: Prisma.Decimal;
  currency: string;
}

export interface SettlementPayment {
  paymentType: PaymentType;
  direction: PaymentDirection;
  amount: Prisma.Decimal;
  currency: string;
  paidAt: Date | null;
}

export interface Settlement {
  currency: string;
  agreedPrice: Prisma.Decimal;
  /** agreed_price x deposit_percentage, to the cent. */
  depositRequired: Prisma.Decimal;
  depositReceived: Prisma.Decimal;
  /** The deposit gate: GOODS_RECEIVED may not happen until this is true. */
  depositMet: boolean;
  /** Deposit + balance received, net of refunds paid out. */
  collected: Prisma.Decimal;
  balanceDue: Prisma.Decimal;
  /** The balance gate: CLOSED_OUT and document release both wait for this. */
  paidInFull: boolean;
}

/** The payment types that move money between the office and its client. */
export const CLIENT_PAYMENT_TYPES: readonly PaymentType[] = [
  PaymentType.DEPOSIT,
  PaymentType.BALANCE,
  PaymentType.REFUND,
];

const ZERO = new Prisma.Decimal(0);

export function settle(
  order: SettlementOrder,
  payments: readonly SettlementPayment[],
): Settlement {
  const cleared = payments.filter(
    (payment) => payment.paidAt !== null && payment.currency === order.currency,
  );

  const sum = (type: PaymentType, direction: PaymentDirection) =>
    cleared
      .filter((p) => p.paymentType === type && p.direction === direction)
      .reduce((total, p) => total.plus(p.amount), ZERO);

  const depositReceived = sum(PaymentType.DEPOSIT, PaymentDirection.INBOUND);
  const collected = depositReceived
    .plus(sum(PaymentType.BALANCE, PaymentDirection.INBOUND))
    .minus(sum(PaymentType.REFUND, PaymentDirection.OUTBOUND));

  const depositRequired = order.agreedPrice
    .times(order.depositPercentage)
    .dividedBy(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  const balanceDue = Prisma.Decimal.max(
    ZERO,
    order.agreedPrice.minus(collected),
  );

  return {
    currency: order.currency,
    agreedPrice: order.agreedPrice,
    depositRequired,
    depositReceived,
    depositMet: depositReceived.greaterThanOrEqualTo(depositRequired),
    collected,
    balanceDue,
    paidInFull: collected.greaterThanOrEqualTo(order.agreedPrice),
  };
}

type Db = Prisma.TransactionClient | PrismaClient;

const SETTLEMENT_PAYMENT_SELECT = {
  paymentType: true,
  direction: true,
  amount: true,
  currency: true,
  paidAt: true,
} satisfies Prisma.PaymentSelect;

/** Reads one order's ledger and settles it. Null when the order is gone. */
export async function loadSettlement(
  db: Db,
  orderId: string,
): Promise<Settlement | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      agreedPrice: true,
      depositPercentage: true,
      currency: true,
      payments: {
        where: { paymentType: { in: [...CLIENT_PAYMENT_TYPES] } },
        select: SETTLEMENT_PAYMENT_SELECT,
      },
    },
  });

  return order ? settle(order, order.payments) : null;
}

/** Same, for a page of orders in one query rather than one per row. */
export async function loadSettlements(
  db: Db,
  orderIds: readonly string[],
): Promise<Map<string, Settlement>> {
  if (orderIds.length === 0) {
    return new Map();
  }

  const orders = await db.order.findMany({
    where: { id: { in: [...new Set(orderIds)] } },
    select: {
      id: true,
      agreedPrice: true,
      depositPercentage: true,
      currency: true,
      payments: {
        where: { paymentType: { in: [...CLIENT_PAYMENT_TYPES] } },
        select: SETTLEMENT_PAYMENT_SELECT,
      },
    },
  });

  return new Map(
    orders.map((order) => [order.id, settle(order, order.payments)]),
  );
}
