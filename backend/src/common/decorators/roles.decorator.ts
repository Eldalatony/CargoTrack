import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route (or a whole controller) to the listed roles.
 *
 * Absence of this decorator means "any authenticated user" — it never means
 * "anyone", because JwtAuthGuard has already run.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
