import { Injectable } from '@nestjs/common';
import { EntityType, Prisma, StatusHistory } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

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
 */
@Injectable()
export class StatusHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  record(
    tx: Prisma.TransactionClient,
    change: StatusChange,
  ): Promise<StatusHistory> {
    return tx.statusHistory.create({
      data: {
        entityType: change.entityType,
        entityId: change.entityId,
        fromStatus: change.fromStatus,
        toStatus: change.toStatus,
        changedBy: change.changedBy,
        reason: change.reason ?? null,
      },
    });
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
