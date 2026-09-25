import { Injectable } from '@nestjs/common';
import { EntityType, Prisma, StatusHistory } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { writeNotifications } from '../notifications/notification-outbox';

export interface StatusChange {
  entityType: EntityType;
  entityId: string;
  /** Null only for the row written when the entity is first created. */
  fromStatus: string | null;
  toStatus: string;
  changedBy: string | null;
  reason?: string | null;
}

/**
 * The audit trail behind every status column.
 *
 * `record` deliberately takes a transaction client rather than using its own:
 * the history row and the status column must move together or not at all. A
 * status change that fails to leave a trail is worse than one that fails
 * outright, because nothing about the resulting row looks wrong.
 *
 * The table is append-only. There is no update or delete path here, and none
 * should be added — corrections are new rows.
 *
 * Every row also fans out to NOTIFICATIONS in the same transaction. Putting
 * that here, rather than in each service, is what makes "every status
 * transition enqueues a job" true of transitions nobody has written yet.
 */
@Injectable()
export class StatusHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    tx: Prisma.TransactionClient,
    change: StatusChange,
  ): Promise<StatusHistory> {
    const row = await tx.statusHistory.create({
      data: {
        entityType: change.entityType,
        entityId: change.entityId,
        fromStatus: change.fromStatus,
        toStatus: change.toStatus,
        changedBy: change.changedBy,
        reason: change.reason ?? null,
      },
    });

    await writeNotifications(tx, change);

    return row;
  }

  /** Oldest first — this is read as a story, not as a feed. */
  findForEntity(
    entityType: EntityType,
    entityId: string,
  ): Promise<StatusHistory[]> {
    return this.prisma.statusHistory.findMany({
      where: { entityType, entityId },
      orderBy: { changedAt: 'asc' },
      include: {
        changedByUser: { select: { id: true, name: true, role: true } },
      },
    });
  }
}
