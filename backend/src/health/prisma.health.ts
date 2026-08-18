import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrismaHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly prisma: PrismaService,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);

    try {
      const start = Date.now();
      await this.prisma.ping();
      return indicator.up({ responseTimeMs: Date.now() - start });
    } catch (error) {
      return indicator.down({
        message: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }
}
