import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../redis/redis.constants';

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);

    try {
      const start = Date.now();
      const reply = await this.redis.ping();

      if (reply !== 'PONG') {
        return indicator.down({ message: `unexpected reply "${reply}"` });
      }

      return indicator.up({ responseTimeMs: Date.now() - start });
    } catch (error) {
      return indicator.down({
        message: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }
}
