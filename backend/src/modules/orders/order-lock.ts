import { NotFoundException } from '@nestjs/common';
import { Order, Prisma } from '@prisma/client';

/**
 * Reads an order with a row lock held until the transaction ends.
 *
 * Money and documents both hang off the order, and both change what the other
 * should do: a balance clearing releases every document on file, and a
 * document uploaded after the balance cleared is released on arrival. Taking
 * this lock in both paths means an upload cannot slip in between "the payment
 * cleared" and "release every withheld document", and be left withheld.
 *
 * Must be called inside an interactive $transaction.
 */
export async function lockOrder(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<Order> {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE
  `;

  if (locked.length === 0) {
    throw new NotFoundException(`Order ${id} not found`);
  }

  return tx.order.findUniqueOrThrow({ where: { id } });
}
