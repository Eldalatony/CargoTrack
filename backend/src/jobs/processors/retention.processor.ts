import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

import { ClientDocumentRetentionService } from '../../modules/client-documents/client-document-retention.service';
import {
  QUEUE_RETENTION,
  RETENTION_CRON,
  RETENTION_JOB_NAME,
  RETENTION_SCHEDULER_ID,
} from '../queues/queue.constants';

/** Consumes the retention queue: one job, one sweep. */
@Processor(QUEUE_RETENTION)
export class RetentionProcessor extends WorkerHost {
  constructor(private readonly retention: ClientDocumentRetentionService) {
    super();
  }

  async process(job: Job): Promise<{ purged: number }> {
    if (job.name !== RETENTION_JOB_NAME) {
      throw new Error(`Unknown retention job ${job.name}`);
    }

    return this.retention.purgeExpired();
  }
}

/**
 * Registers the daily sweep with BullMQ's job scheduler when the worker
 * starts. Upsert, not add: restarting the worker (or running two of them)
 * converges on one schedule instead of stacking duplicates.
 */
@Injectable()
export class RetentionScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(RetentionScheduler.name);

  constructor(@InjectQueue(QUEUE_RETENTION) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      RETENTION_SCHEDULER_ID,
      { pattern: RETENTION_CRON },
      { name: RETENTION_JOB_NAME, opts: { removeOnComplete: 30 } },
    );

    this.logger.log(`Client document retention scheduled: ${RETENTION_CRON}`);
  }
}
