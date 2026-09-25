import { UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface Load {
  cbm: Prisma.Decimal;
  weightKg: Prisma.Decimal;
}

export const EMPTY_LOAD: Load = {
  cbm: new Prisma.Decimal(0),
  weightKg: new Prisma.Decimal(0),
};

export function sumLoads(loads: readonly Load[]): Load {
  return loads.reduce(
    (total, load) => ({
      cbm: total.cbm.plus(load.cbm),
      weightKg: total.weightKg.plus(load.weightKg),
    }),
    EMPTY_LOAD,
  );
}

/**
 * The capacity guard.
 *
 * A container is full when EITHER limit is reached — a 40HC of flat-packed
 * steel runs out of payload long before it runs out of volume, and a 40HC of
 * rattan does the opposite. Filling exactly to the limit is allowed; one
 * thousandth of a cubic metre past it is not.
 *
 * Decimal throughout. Summing allocations as floats would let 0.1 + 0.2
 * decide whether the last order fits.
 */
export function assertFits(
  capacity: Load,
  allocated: Load,
  adding: Load,
): void {
  const cbmAfter = allocated.cbm.plus(adding.cbm);
  const weightAfter = allocated.weightKg.plus(adding.weightKg);

  const problems: string[] = [];

  if (cbmAfter.greaterThan(capacity.cbm)) {
    problems.push(
      `${adding.cbm.toString()} CBM requested, ${remaining(capacity.cbm, allocated.cbm)} CBM of ${capacity.cbm.toString()} left`,
    );
  }

  if (weightAfter.greaterThan(capacity.weightKg)) {
    problems.push(
      `${adding.weightKg.toString()} kg requested, ${remaining(capacity.weightKg, allocated.weightKg)} kg of ${capacity.weightKg.toString()} left`,
    );
  }

  if (problems.length > 0) {
    throw new UnprocessableEntityException(
      `Allocation exceeds container capacity: ${problems.join('; ')}`,
    );
  }
}

function remaining(limit: Prisma.Decimal, used: Prisma.Decimal): string {
  return Prisma.Decimal.max(limit.minus(used), 0).toString();
}

/** Sum of every allocation in the container, read inside the caller's lock. */
export async function allocatedLoad(
  tx: Prisma.TransactionClient,
  containerId: string,
  excludingAllocationId?: string,
): Promise<Load> {
  const { _sum } = await tx.containerAllocation.aggregate({
    where: {
      containerId,
      ...(excludingAllocationId ? { id: { not: excludingAllocationId } } : {}),
    },
    _sum: { allocatedCbm: true, allocatedWeightKg: true },
  });

  return {
    cbm: _sum.allocatedCbm ?? EMPTY_LOAD.cbm,
    weightKg: _sum.allocatedWeightKg ?? EMPTY_LOAD.weightKg,
  };
}
