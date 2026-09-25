import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationStatus, Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';

import {
  NOTIFICATION_JOB_OPTIONS,
  QUEUE_NOTIFICATIONS,
} from '../../jobs/queues/queue.constants';
import type { NotificationJobData } from '../../jobs/processors/notifications.processor';
import { PrismaService } from '../../prisma/prisma.service';

const PAGE_SIZE = 200;

/**
 * Every Nth tick starts again from the oldest PENDING row instead of the
 * cursor. A row written by a long transaction can commit with a created_at
 * older than rows the cursor has already passed; the rescan is what catches
 * it. Enqueueing is idempotent, so re-offering rows costs nothing but a
 * round trip.
 */
const RESCAN_EVERY_TICKS = 30;

interface Cursor {
  createdAt: Date;
  id: string;
}

/**
 * The enqueue half of the outbox (ADR 0004), running in the API process.
 *
 * Status changes write PENDING rows inside their own transaction; this relay
 * offers those rows to BullMQ once they are committed and visible. It never
 * delivers anything — the API enqueues, the worker consumes.
 */
@Injectable()
export class NotificationRelay
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationRelay.name);
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<number> | null = null;
  private cursor: Cursor | null = null;
  private ticks = 0;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NOTIFICATIONS)
    private readonly queue: Queue<NotificationJobData>,
    config: ConfigService,
  ) {
    this.intervalMs = config.get<number>(
      'NOTIFICATION_RELAY_INTERVAL_MS',
      1000,
    );
  }

  onApplicationBootstrap(): void {
    if (this.intervalMs <= 0) {
      this.logger.warn('Notification relay disabled');
      return;
    }

    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
    }

    await this.running;
  }

  /** Offers every PENDING row, from the oldest. Returns how many were seen. */
  async flush(): Promise<number> {
    await this.running;
    this.cursor = null;

    return this.run();
  }

  private async tick(): Promise<void> {
    if (this.running) {
      return;
    }

    if (++this.ticks % RESCAN_EVERY_TICKS === 0) {
      this.cursor = null;
    }

    try {
      await this.run();
    } catch (error) {
      // Redis or Postgres being briefly away is not fatal: the rows stay
      // PENDING and the next tick offers them again.
      this.logger.warn(`Relay tick failed: ${(error as Error).message}`);
    }
  }

  private run(): Promise<number> {
    this.running = this.drain().finally(() => {
      this.running = null;
    });

    return this.running;
  }

  private async drain(): Promise<number> {
    let offered = 0;

    for (;;) {
      const rows = await this.prisma.notification.findMany({
        where: {
          status: NotificationStatus.PENDING,
          scheduledAt: { lte: new Date() },
          ...this.after(this.cursor),
        },
        select: { id: true, eventType: true, createdAt: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: PAGE_SIZE,
      });

      if (rows.length === 0) {
        return offered;
      }

      await this.queue.addBulk(
        rows.map((row) => ({
          name: row.eventType,
          data: { notificationId: row.id },
          opts: { ...NOTIFICATION_JOB_OPTIONS, jobId: row.id },
        })),
      );

      offered += rows.length;
      const last = rows[rows.length - 1];
      this.cursor = { createdAt: last.createdAt, id: last.id };

      if (rows.length < PAGE_SIZE) {
        return offered;
      }
    }
  }

  private after(cursor: Cursor | null): Prisma.NotificationWhereInput {
    if (!cursor) {
      return {};
    }

    return {
      OR: [
        { createdAt: { gt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { gt: cursor.id } },
      ],
    };
  }
}
