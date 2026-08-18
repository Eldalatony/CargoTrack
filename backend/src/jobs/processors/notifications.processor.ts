import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { NotificationStatus } from '@prisma/client';
import type { Job } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_NOTIFICATIONS } from '../queues/queue.constants';

export interface NotificationJobData {
  notificationId: string;
}

/**
 * Consumes the notification queue.
 *
 * Phase 1 scope: the delivery step is a stub — no email or SMS provider is
 * wired up yet. The surrounding retry / dead-letter bookkeeping is real,
 * because that is the part Gate 4 verifies.
 */
@Processor(QUEUE_NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    const { notificationId } = job.data;

    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      this.logger.warn(
        `Job ${job.id} references unknown notification ${notificationId} — dropping`,
      );
      return;
    }

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: NotificationStatus.RETRYING,
        retryCount: job.attemptsMade,
      },
    });

    // TODO(Phase 4): dispatch through the channel provider.
    this.logger.debug(
      `Delivering ${notification.eventType} to ${notification.recipientType} ${notification.recipientId} via ${notification.channel}`,
    );

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
        lastError: null,
      },
    });
  }

  /**
   * Fires on every failed attempt. Only the last one is terminal — that is
   * when the row becomes DEAD_LETTER and shows up in the dashboard.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<NotificationJobData>, error: Error): Promise<void> {
    const isFinalAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);

    await this.prisma.notification.update({
      where: { id: job.data.notificationId },
      data: {
        status: isFinalAttempt
          ? NotificationStatus.DEAD_LETTER
          : NotificationStatus.FAILED,
        retryCount: job.attemptsMade,
        lastError: error.message,
      },
    });

    this.logger.error(
      `Notification ${job.data.notificationId} attempt ${job.attemptsMade} failed: ${error.message}`,
    );
  }
}
