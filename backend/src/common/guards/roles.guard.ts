import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Enforces @Roles(). Runs after JwtAuthGuard, so a missing principal here
 * means the route was left @Public() by mistake — that is a 403, not a pass.
 *
 * Role checks answer "may this kind of user call this endpoint at all". They
 * are not a substitute for row-level scoping, which lives in the services
 * (see common/access/client-scope.ts).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) {
      return true;
    }

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();

    if (!user) {
      throw new ForbiddenException('Authentication is required');
    }

    if (!required.includes(user.role)) {
      throw new ForbiddenException(
        `This endpoint is restricted to: ${required.join(', ')}`,
      );
    }

    return true;
  }
}
