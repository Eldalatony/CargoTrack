import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Everything about the HTTP surface that is not a controller.
 *
 * It lives here rather than inline in main.ts so the e2e suite can boot the
 * application exactly as the container does. A test that configures its own
 * pipes is testing a different application than the one that ships.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api', { exclude: ['health', 'health/live'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN', 'http://localhost:3000'),
    credentials: true,
  });

  // Flushes Prisma and Redis connections on SIGTERM from `docker compose down`.
  app.enableShutdownHooks();
}
