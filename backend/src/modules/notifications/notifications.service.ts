import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Notification,
  NotificationStatus,
  Prisma,
  RecipientType,
} from '@prisma/client';
import type { Queue } from 'bullmq';

import { isClient, requireClientId } from '../../common/access/client-scope';
import { Paginated, paginate } from '../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { NotificationJobData } from '../../jobs/processors/notifications.processor';
import {
  NOTIFICATION_JOB_OPTIONS,
  QUEUE_NOTIFICATIONS,
} from '../../jobs/queues/queue.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';

export type NotificationSummary = Record<NotificationStatus, number>;

/**
 * The read side of the pipeline, and the one manual lever on it.
 *
 * The Office Manager sees every row — DEAD_LETTER is the failed-jobs panel,
 * with retry_count and last_error beside each. A client sees only messages
 * addressed to them and marked client-visible; internal traffic about
 * suppliers and stock holds never appears in their inbox.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NOTIFICATIONS)
    private readonly queue: Queue<NotificationJobData>,
  ) {}

  async findAll(
    query: QueryNotificationsDto,
    user: AuthenticatedUser,
  ): Promise<Paginated<Notification>> {
    const where: Prisma.NotificationWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...this.scope(user),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return paginate(data, total, query);
  }

  /** Counts per status, every status present — what the dashboard badge reads. */
  async summary(): Promise<NotificationSummary> {
    const groups = await this.prisma.notification.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const summary = Object.fromEntries(
      Object.values(NotificationStatus).map((status) => [status, 0]),
    ) as NotificationSummary;

    for (const group of groups) {
      summary[group.status] = group._count._all;
    }

    return summary;
  }

  /**
   * Gives a dead-lettered notification a fresh attempt budget — for when the
   * cause has been fixed (a corrected email address, a provider back up).
   *
   * last_error is kept, so the row still says why it failed last time until
   * a new attempt says otherwise.
   */
  async retry(id: string): Promise<Notification> {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, status: NotificationStatus.DEAD_LETTER },
      data: { status: NotificationStatus.PENDING, retryCount: 0 },
    });

    if (count === 0) {
      const existing = await this.prisma.notification.findUnique({
        where: { id },
        select: { status: true },
      });

      if (!existing) {
        throw new NotFoundException(`Notification ${id} not found`);
      }

      throw new UnprocessableEntityException(
        `Only a DEAD_LETTER notification can be retried. ${id} is ${existing.status}`,
      );
    }

    const notification = await this.prisma.notification.findUniqueOrThrow({
      where: { id },
    });

    // The exhausted job still sits in BullMQ's failed set under this id, and
    // an add for an id the queue already holds is ignored. Clear it first.
    await (await this.queue.getJob(id))?.remove();
    await this.queue.add(
      notification.eventType,
      { notificationId: id },
      { ...NOTIFICATION_JOB_OPTIONS, jobId: id },
    );

    return notification;
  }

  private scope(user: AuthenticatedUser): Prisma.NotificationWhereInput {
    if (!isClient(user)) {
      return {};
    }

    return {
      recipientType: RecipientType.CLIENT,
      recipientId: requireClientId(user),
      clientVisible: true,
    };
  }
}
