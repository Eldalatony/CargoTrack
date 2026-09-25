import { NotFoundException } from '@nestjs/common';
import { Container, Prisma } from '@prisma/client';

/**
 * Reads a container with a row lock held until the transaction ends.
 *
 * Every write that depends on the container's current state or remaining
 * capacity goes through here first. Without the lock, two allocations racing
 * for the last 5 CBM each read "5 CBM free", both pass the capacity guard,
 * and the box is booked at 110% — the check would be correct and the result
 * still wrong. With it, the second request waits, then reads the first one's
 * allocation and is rejected.
 *
 * Must be called inside an interactive $transaction; outside one the lock is
 * released the moment the statement returns.
 */
export async function lockContainer(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<Container> {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM containers WHERE id = ${id}::uuid FOR UPDATE
  `;

  if (locked.length === 0) {
    throw new NotFoundException(`Container ${id} not found`);
  }

  return tx.container.findUniqueOrThrow({ where: { id } });
}
