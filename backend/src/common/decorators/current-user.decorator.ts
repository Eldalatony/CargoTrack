import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Injects the authenticated principal into a handler argument.
 *
 * Services take the principal explicitly instead of reading it from an
 * ambient request object, so scoping decisions are visible in every service
 * signature that makes one.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>();

    return request.user;
  },
);
