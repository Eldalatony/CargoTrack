import {
  CounterpartyType,
  EntityType,
  NotificationChannel,
  Prisma,
  RecipientType,
  UserRole,
} from '@prisma/client';

import type { StatusChange } from '../status-history/status-history.service';

interface Recipient {
  recipientType: RecipientType;
  recipientId: string;
  channel: NotificationChannel;
  clientVisible: boolean;
}

/**
 * Writes the NOTIFICATIONS rows a status change fans out to, inside the same
 * transaction as the change itself.
 *
 * This is the outbox half of the pipeline (ADR 0004). The row is the promise
 * that a job will run: it commits with the transition or not at all, so a
 * rolled-back transition never notifies anyone and a committed one is never
 * silently dropped because Redis blinked at the wrong moment. The relay picks
 * PENDING rows up and enqueues them once they are visible.
 *
 * Routing:
 *   - Anything a client is party to — their order, the container carrying it,
 *     a document on it, money they paid or are owed — emails that client.
 *   - Everything else is internal (a production batch moving, a stock hold,
 *     an empty container being opened) and lands in every Office Manager's
 *     in-app inbox, flagged not client-visible.
 */
export async function writeNotifications(
  tx: Prisma.TransactionClient,
  change: StatusChange,
): Promise<number> {
  const clientIds = await clientsConcernedBy(tx, change);

  const recipients: Recipient[] =
    clientIds.length > 0
      ? clientIds.map((clientId) => ({
          recipientType: RecipientType.CLIENT,
          recipientId: clientId,
          channel: NotificationChannel.EMAIL,
          clientVisible: true,
        }))
      : (
          await tx.user.findMany({
            where: { role: UserRole.OFFICE_MANAGER },
            select: { id: true },
          })
        ).map((manager) => ({
          recipientType: RecipientType.USER,
          recipientId: manager.id,
          channel: NotificationChannel.IN_APP,
          clientVisible: false,
        }));

  if (recipients.length === 0) {
    return 0;
  }

  const { count } = await tx.notification.createMany({
    data: recipients.map((recipient) => ({
      eventType: eventTypeFor(change),
      entityType: change.entityType,
      entityId: change.entityId,
      ...recipient,
    })),
  });

  return count;
}

/** e.g. ORDER.IN_TRANSIT, DOCUMENT.RELEASED, PAYMENT.PAID */
export function eventTypeFor(
  change: Pick<StatusChange, 'entityType' | 'toStatus'>,
): string {
  return `${change.entityType}.${change.toStatus}`;
}

async function clientsConcernedBy(
  tx: Prisma.TransactionClient,
  change: StatusChange,
): Promise<string[]> {
  const { entityType, entityId } = change;

  switch (entityType) {
    case EntityType.ORDER: {
      const order = await tx.order.findUnique({
        where: { id: entityId },
        select: { clientId: true },
      });
      return order ? [order.clientId] : [];
    }

    case EntityType.CONTAINER: {
      // A consolidated container carries several clients' goods; each of
      // them wants to know it sailed.
      const allocations = await tx.containerAllocation.findMany({
        where: { containerId: entityId },
        select: { order: { select: { clientId: true } } },
      });
      return [...new Set(allocations.map(({ order }) => order.clientId))];
    }

    case EntityType.DOCUMENT: {
      const document = await tx.document.findUnique({
        where: { id: entityId },
        select: { order: { select: { clientId: true } } },
      });
      return document?.order ? [document.order.clientId] : [];
    }

    case EntityType.PAYMENT: {
      const payment = await tx.payment.findUnique({
        where: { id: entityId },
        select: {
          counterpartyType: true,
          order: { select: { clientId: true } },
        },
      });
      // What the office pays its factory or its freight forwarder is margin,
      // and none of the client's business.
      return payment?.counterpartyType === CounterpartyType.CLIENT
        ? [payment.order.clientId]
        : [];
    }

    case EntityType.PRODUCTION_ORDER:
    case EntityType.STOCK_RECORD:
      return [];
  }
}
