import { UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { EMPTY_LOAD, Load, assertFits, sumLoads } from './container-capacity';

const load = (cbm: string | number, weightKg: string | number): Load => ({
  cbm: new Prisma.Decimal(cbm),
  weightKg: new Prisma.Decimal(weightKg),
});

describe('container capacity guard', () => {
  // A 20GP: roughly 33 CBM, 28 tonnes of payload.
  const capacity = load(33, 28000);

  it('accepts an allocation that fills the container exactly', () => {
    expect(() =>
      assertFits(capacity, load(20, 10000), load(13, 18000)),
    ).not.toThrow();
  });

  it('rejects one thousandth of a CBM over the limit', () => {
    expect(() => assertFits(capacity, load(20, 0), load('13.001', 0))).toThrow(
      UnprocessableEntityException,
    );
  });

  it('rejects one gram over the payload even with volume to spare', () => {
    expect(() =>
      assertFits(capacity, load(1, 27999), load(1, '1.001')),
    ).toThrow(/kg requested/);
  });

  it('reports both limits when both are breached', () => {
    expect(() => assertFits(capacity, EMPTY_LOAD, load(40, 30000))).toThrow(
      /CBM requested.*kg requested/,
    );
  });

  it('says how much room is left', () => {
    expect(() => assertFits(capacity, load(30, 0), load(5, 0))).toThrow(
      /3 CBM of 33 left/,
    );
  });

  it('does not let float drift decide the last fit', () => {
    // 0.1 + 0.2 !== 0.3 in IEEE 754; in Decimal it does.
    const allocated = sumLoads([load('0.1', 0), load('0.2', 0)]);

    expect(() =>
      assertFits(load('0.4', 0), allocated, load('0.1', 0)),
    ).not.toThrow();
  });
});
