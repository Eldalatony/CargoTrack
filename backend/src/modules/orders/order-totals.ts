import { Prisma } from '@prisma/client';

/** Storage precision from the schema: total_cbm and total_weight_kg. */
const CBM_DECIMALS = 3;
const WEIGHT_DECIMALS = 3;

export interface ItemMeasurement {
  quantity: number;
  unitCbm: Prisma.Decimal | number | string;
  unitWeightKg: Prisma.Decimal | number | string;
}

export interface OrderTotals {
  totalCbm: Prisma.Decimal;
  totalWeightKg: Prisma.Decimal;
}

/**
 * Rolls order items up into the order.
 *
 * Volume and weight decide freight cost and container capacity, so they are
 * derived from the line items every time the lines change rather than being
 * a number somebody types in — a hand-entered total that drifts from its
 * lines is how a container gets loaded over its CBM limit.
 *
 * Decimal arithmetic throughout: 0.1 + 0.2 in binary floating point is not
 * 0.3, and these values are multiplied by quantity and then billed.
 */
export function orderTotals(items: readonly ItemMeasurement[]): OrderTotals {
  const zero = new Prisma.Decimal(0);

  const totals = items.reduce(
    (accumulator, item) => {
      const quantity = new Prisma.Decimal(item.quantity);

      return {
        cbm: accumulator.cbm.plus(
          new Prisma.Decimal(item.unitCbm).times(quantity),
        ),
        weight: accumulator.weight.plus(
          new Prisma.Decimal(item.unitWeightKg).times(quantity),
        ),
      };
    },
    { cbm: zero, weight: zero },
  );

  return {
    totalCbm: totals.cbm.toDecimalPlaces(CBM_DECIMALS),
    totalWeightKg: totals.weight.toDecimalPlaces(WEIGHT_DECIMALS),
  };
}

/** Line value, for quoting and for the order-vs-lines sanity check. */
export function lineValue(
  quantity: number,
  unitPrice: Prisma.Decimal | number | string,
): Prisma.Decimal {
  return new Prisma.Decimal(unitPrice).times(quantity).toDecimalPlaces(2);
}
