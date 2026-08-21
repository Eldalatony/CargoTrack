import { Prisma } from '@prisma/client';

import { lineValue, orderTotals } from './order-totals';

describe('orderTotals', () => {
  it('is zero for an order with no items', () => {
    const totals = orderTotals([]);

    expect(totals.totalCbm.toString()).toBe('0');
    expect(totals.totalWeightKg.toString()).toBe('0');
  });

  it('multiplies each line by its quantity and sums', () => {
    const totals = orderTotals([
      { quantity: 10, unitCbm: '0.5', unitWeightKg: '12.5' },
      { quantity: 4, unitCbm: '1.25', unitWeightKg: '30' },
    ]);

    expect(totals.totalCbm.toString()).toBe('10');
    expect(totals.totalWeightKg.toString()).toBe('245');
  });

  it('does not accumulate binary floating point error', () => {
    // 0.1 + 0.2 !== 0.3 in float64; three lines of 0.1 CBM must be exactly 0.3.
    const totals = orderTotals([
      { quantity: 1, unitCbm: '0.1', unitWeightKg: '0' },
      { quantity: 1, unitCbm: '0.1', unitWeightKg: '0' },
      { quantity: 1, unitCbm: '0.1', unitWeightKg: '0' },
    ]);

    expect(totals.totalCbm.equals(new Prisma.Decimal('0.3'))).toBe(true);
  });

  it('rounds to the precision the columns actually store', () => {
    const totals = orderTotals([
      { quantity: 3, unitCbm: '0.0001', unitWeightKg: '0.0004' },
    ]);

    expect(totals.totalCbm.toString()).toBe('0');
    expect(totals.totalWeightKg.toString()).toBe('0.001');
  });

  it('accepts Decimal inputs as they come back from Prisma', () => {
    const totals = orderTotals([
      {
        quantity: 2,
        unitCbm: new Prisma.Decimal('1.5'),
        unitWeightKg: new Prisma.Decimal('20'),
      },
    ]);

    expect(totals.totalCbm.toString()).toBe('3');
    expect(totals.totalWeightKg.toString()).toBe('40');
  });
});

describe('lineValue', () => {
  it('rounds money to two places', () => {
    expect(lineValue(3, '10.005').toString()).toBe('30.02');
  });
});
