import { Injectable, Logger } from '@nestjs/common';
import { NotificationStatus } from '@prisma/client';
import { UnrecoverableError } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationChannels } from './notification-channels';

export interface Attempt {
  /** Failed attempts before this one — BullMQ's job.attemptsMade. */
  attemptsMade: number;
  /** The job's attempt budget — job.opts.attempts. */
  maxAttempts: number;
}

export type AttemptResult = 'sent' | 'already-sent' | 'dropped';

/**
 * Where a failed attempt leaves the row. Pure, so the boundary between "one
 * more try" and "dead letter" is unit-tested rather than discovered.
 */
export function statusAfterFailure(
  failedAttempts: number,
  maxAttempts: number,
  unrecoverable: boolean,
): NotificationStatus {
  return unrecoverable || failedAttempts >= maxAttempts
    ? NotificationStatus.DEAD_LETTER
    : NotificationStatus.FAILED;
}

/**
 * One delivery attempt and the NOTIFICATIONS bookkeeping around it:
 *
 *   picked up   -> RETRYING, retry_count = failed attempts so far
 *   delivered   -> SENT, sent_at stamped, last_error cleared
 *   failed      -> FAILED (more attempts left) or DEAD_LETTER (none left),
 *                  retry_count and last_error recorded, then rethrown so
 *                  BullMQ schedules the backoff
 *
 * The failure bookkeeping happens here, before the error reaches BullMQ,
 * rather than in a 'failed' event listener. BullMQ does not await listeners,
 * so with a short backoff the next attempt could mark the row RETRYING before
 * the listener marked it FAILED, and the row would end in the wrong state.
 *
 * Kept free of the @Processor decorator so the Gate 4 test can drive the real
 * logic from its own BullMQ worker on an isolated queue.
 */
@Injectable()
export class NotificationDelivery {
  private readonly logger = new Logger(NotificationDelivery.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: NotificationChannels,
  ) {}

  async attempt(
    notificationId: string,
    { attemptsMade, maxAttempts }: Attempt,
  ): Promise<AttemptResult> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      this.logger.warn(
        `Notification ${notificationId} no longer exists — dropping the job`,
      );
      return 'dropped';
    }

    if (notification.status === NotificationStatus.SENT) {
      return 'already-sent';
    }

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { status: NotificationStatus.RETRYING, retryCount: attemptsMade },
    });

    try {
      await this.channels.deliver(notification);
    } catch (error) {
      const failedAttempts = attemptsMade + 1;
      const status = statusAfterFailure(
        failedAttempts,
        maxAttempts,
        error instanceof UnrecoverableError,
      );

      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status,
          retryCount: failedAttempts,
          lastError: (error as Error).message,
        },
      });

      this.logger.error(
        `Notification ${notificationId} attempt ${failedAttempts}/${maxAttempts} failed (${status}): ${(error as Error).message}`,
      );

      throw error;
    }

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
        lastError: null,
      },
    });

    return 'sent';
  }
}
