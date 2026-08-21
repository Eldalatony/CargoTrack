import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { redisOptionsFromUrl } from '../config/redis.config';
import { QUEUE_NOTIFICATIONS, QUEUE_RETENTION } from './queues/queue.constants';

/**
 * Registers the BullMQ connection and the queue producers.
 *
 * Imported by both entrypoints: the API enqueues jobs, the worker consumes
 * them. Processors are registered separately in WorkerModule so the API
 * process never picks up jobs.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: redisOptionsFromUrl(config.getOrThrow<string>('REDIS_URL')),
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUE_NOTIFICATIONS },
      { name: QUEUE_RETENTION },
    ),
  ],
  exports: [BullModule],
})
export class JobsModule {}
