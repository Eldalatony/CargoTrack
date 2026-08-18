import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';

import { PrismaHealthIndicator } from './prisma.health';
import { RedisHealthIndicator } from './redis.health';

/**
 * Probed by the Docker Compose health check and by the deployment platform.
 * Returns 503 when any dependency is down, which is what gates the `backend`
 * service from being reported healthy.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prisma.isHealthy('postgres'),
      () => this.redis.isHealthy('redis'),
    ]);
  }

  /** Liveness only — does not touch dependencies. */
  @Get('live')
  live() {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }
}
