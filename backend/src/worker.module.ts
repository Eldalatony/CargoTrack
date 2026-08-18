import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateWorkerEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { NotificationsProcessor } from './jobs/processors/notifications.processor';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

/**
 * Worker process. Shares the backend image and every module below with the
 * API — the only difference is that processors are registered here, so the
 * API never consumes jobs it enqueued.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: true,
      validate: validateWorkerEnv,
    }),
    PrismaModule,
    RedisModule,
    JobsModule,
    HealthModule,
  ],
  providers: [NotificationsProcessor],
})
export class WorkerModule {}
