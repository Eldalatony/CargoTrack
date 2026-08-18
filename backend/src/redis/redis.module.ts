import { Global, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import Redis from 'ioredis';

import { redisOptionsFromUrl } from '../config/redis.config';
import { REDIS_CLIENT } from './redis.constants';

/**
 * A single shared Redis connection for direct commands (health checks, cache
 * reads). BullMQ creates its own connections from the same options — queues
 * must not share a connection with blocking workers.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.getOrThrow<string>('REDIS_URL');
        const client = new Redis(redisOptionsFromUrl(url));
        const logger = new Logger('Redis');

        client.on('ready', () => logger.log('Connected to Redis'));
        client.on('error', (error: Error) =>
          logger.error(`Redis error: ${error.message}`),
        );

        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(private readonly moduleRef: ModuleRef) {}

  async onApplicationShutdown(): Promise<void> {
    const client = this.moduleRef.get<Redis>(REDIS_CLIENT, { strict: false });
    await client.quit();
  }
}
