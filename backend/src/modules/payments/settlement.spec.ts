import { PaymentDirection, PaymentType, Prisma } from '@prisma/client';

import { SettlementPayment, settle } from './settlement';

const order = {
  agreedPrice: new Prisma.Decimal(24000),
  depositPercentage: new Prisma.Decimal(20),
  currency: 'USD',
};

const paid = new Date('2026-09-01T10:00:00Z');

function payment(
  paymentType: PaymentType,
  amount: number | string,
  overrides: Partial<SettlementPayment> = {},
): SettlementPayment {
  return {
    paymentType,
    direction:
      paymentType === PaymentType.REFUND
        ? PaymentDirection.OUTBOUND
        : PaymentDirection.INBOUND,
    amount: new Prisma.Decimal(amount),
    currency: 'USD',
    paidAt: paid,
    ...overrides,
  };
}

describe('settle', () => {
  it('requires the negotiated deposit percentage, to the cent', () => {
    const result = settle(
      { ...order, depositPercentage: new Prisma.Decimal(17.5) },
      [],
    );

    expect(result.depositRequired.toString()).toBe('4200');
    expect(result.depositMet).toBe(false);
    expect(result.balanceDue.toString()).toBe('24000');
  });

  it('meets the deposit gate at exactly the required amount', () => {
    expect(settle(order, [payment(PaymentType.DEPOSIT, 4800)]).depositMet).toBe(
      true,
    );
  });

  it('misses the deposit gate by a single cent', () => {
    expect(
      settle(order, [payment(PaymentType.DEPOSIT, '4799.99')]).depositMet,
    ).toBe(false);
  });

  it('does not count an invoice that has been raised but not paid', () => {
    const result = settle(order, [
      payment(PaymentType.DEPOSIT, 4800),
      payment(PaymentType.BALANCE, 19200, { paidAt: null }),
    ]);

    expect(result.collected.toString()).toBe('4800');
    expect(result.balanceDue.toString()).toBe('19200');
    expect(result.paidInFull).toBe(false);
  });

  it('is paid in full once deposit and balance cover the agreed price', () => {
    const result = settle(order, [
      payment(PaymentType.DEPOSIT, 4800),
      payment(PaymentType.BALANCE, 19200),
    ]);

    expect(result.paidInFull).toBe(true);
    expect(result.balanceDue.toString()).toBe('0');
  });

  it('accepts a balance paid in instalments', () => {
    const result = settle(order, [
      payment(PaymentType.DEPOSIT, 4800),
      payment(PaymentType.BALANCE, 10000),
      payment(PaymentType.BALANCE, '9199.99'),
    ]);

    expect(result.paidInFull).toBe(false);
    expect(result.balanceDue.toString()).toBe('0.01');
  });

  it('nets refunds paid back to the client', () => {
    const result = settle(order, [
      payment(PaymentType.DEPOSIT, 4800),
      payment(PaymentType.BALANCE, 19200),
      payment(PaymentType.REFUND, 500),
    ]);

    expect(result.collected.toString()).toBe('23500');
    expect(result.paidInFull).toBe(false);
  });

  it('ignores money in another currency rather than guessing a rate', () => {
    const result = settle(order, [
      payment(PaymentType.DEPOSIT, 4800),
      payment(PaymentType.BALANCE, 19200, { currency: 'EUR' }),
    ]);

    expect(result.paidInFull).toBe(false);
  });

  it('ignores payments to suppliers and freight providers', () => {
    const result = settle(order, [
      payment(PaymentType.DEPOSIT, 4800),
      payment(PaymentType.FREIGHT, 19200, {
        direction: PaymentDirection.OUTBOUND,
      }),
    ]);

    expect(result.collected.toString()).toBe('4800');
  });

  it('never reports a negative balance when the client overpays', () => {
    const result = settle(order, [
      payment(PaymentType.DEPOSIT, 4800),
      payment(PaymentType.BALANCE, 20000),
    ]);

    expect(result.balanceDue.toString()).toBe('0');
    expect(result.paidInFull).toBe(true);
  });
});
