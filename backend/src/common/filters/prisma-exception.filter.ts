import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/**
 * Turns Prisma's error codes into the HTTP answers the API contract promises,
 * so services can rely on database constraints instead of re-checking them in
 * application code before every write.
 *
 * The important one is P2003: FK relations are declared `onDelete: Restrict`
 * for every party that owns history, so deleting a supplier with production
 * orders behind it fails at the database rather than orphaning rows.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(
    exception: Prisma.PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ): void {
    const response = host.switchToHttp().getResponse<Response>();

    const { status, message } = this.translate(exception);

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `Unmapped Prisma error ${exception.code}: ${exception.message}`,
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      error: exception.code,
    });
  }

  private translate(exception: Prisma.PrismaClientKnownRequestError): {
    status: HttpStatus;
    message: string;
  } {
    const target = this.targetOf(exception);

    switch (exception.code) {
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'The requested record does not exist',
        };

      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          message: target
            ? `A record with this ${target} already exists`
            : 'A record with these values already exists',
        };

      case 'P2003':
        return {
          status: HttpStatus.CONFLICT,
          message:
            'This record is referenced by other records and cannot be changed or deleted',
        };

      case 'P2000':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: target
            ? `Value too long for ${target}`
            : 'A submitted value is too long for its column',
        };

      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Unexpected database error',
        };
    }
  }

  private targetOf(
    exception: Prisma.PrismaClientKnownRequestError,
  ): string | undefined {
    const target = exception.meta?.target;

    if (Array.isArray(target)) {
      return target.join(', ');
    }

    return typeof target === 'string' ? target : undefined;
  }
}
