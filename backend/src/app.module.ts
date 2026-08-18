import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateApiEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

/**
 * API process. Domain modules are added here from Phase 2 onward.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Values come from the process environment only — injected by Docker
      // Compose locally and by the platform in production.
      ignoreEnvFile: true,
      validate: validateApiEnv,
    }),
    PrismaModule,
    RedisModule,
    JobsModule,
    HealthModule,
  ],
})
export class AppModule {}
