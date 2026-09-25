import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import { NotificationDelivery } from '../delivery/notification-delivery';
import { QUEUE_NOTIFICATIONS } from '../queues/queue.constants';

export interface NotificationJobData {
  notificationId: string;
}

/**
 * Consumes the notification queue. The job carries only the row id; the row
 * is the source of truth, and NotificationDelivery owns what happens to it.
 */
@Processor(QUEUE_NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost {
  constructor(private readonly delivery: NotificationDelivery) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    await this.delivery.attempt(job.data.notificationId, {
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts ?? 1,
    });
  }
}
