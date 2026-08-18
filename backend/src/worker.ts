import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { WorkerModule } from './worker.module';

/**
 * Worker entrypoint. Runs the same image as the API with a different command
 * (see the `worker` service in docker-compose.yml).
 *
 * It serves no application routes, but it does listen on WORKER_HEALTH_PORT so
 * that liveness is observable. A worker whose only health check is "the
 * process exists" reports healthy while crash-looping, which is worse than no
 * check at all — this endpoint verifies Postgres and Redis are actually
 * reachable from the worker.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(WorkerModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Worker');

  app.enableShutdownHooks();

  const port = config.get<number>('WORKER_HEALTH_PORT', 4001);
  await app.listen(port, '0.0.0.0');

  logger.log('Worker started — consuming BullMQ queues');
  logger.log(`Liveness endpoint on port ${port}`);
}

void bootstrap();
