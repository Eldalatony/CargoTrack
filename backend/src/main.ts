import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

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

  if (config.get<string>('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('CargoTrack API')
      .setDescription('Logistics & import-export management platform')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();

    SwaggerModule.setup(
      'api/docs',
      app,
      SwaggerModule.createDocument(app, swaggerConfig),
    );
  }

  const port = config.get<number>('PORT', 4000);
  await app.listen(port, '0.0.0.0');

  logger.log(`API listening on port ${port}`);
  logger.log(`Health check at /health`);
}

void bootstrap();
