import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Row-level data scoping for CLIENT principals.
 *
 * The rule the roadmap sets is absolute: client A cannot reach client B's data
 * under any request. Two habits enforce it here:
 *
 *   1. Reads never take a client_id from the request. `scopeWhere` derives it
 *      from the principal, so a client passing ?clientId=<someone else> gets
 *      their own rows, never a second client's.
 *   2. A scoped read that matches nothing is a 404, not a 403. Answering 403
 *      would confirm the record exists, which is itself a leak — an outsider
 *      could enumerate order ids by watching the status code change.
 */
export function isClient(user: AuthenticatedUser): boolean {
  return user.role === UserRole.CLIENT;
}

/**
 * The client_id a CLIENT principal is locked to, or undefined for an Office
 * Manager (who sees everything). Spread into a Prisma `where`.
 */
export function scopeWhere(user: AuthenticatedUser): { clientId?: string } {
  if (!isClient(user)) {
    return {};
  }

  return { clientId: requireClientId(user) };
}

/**
 * A CLIENT user with no client_id is a broken record, not an unscoped one.
 * Failing closed here is what makes `scopeWhere` safe to spread everywhere.
 */
export function requireClientId(user: AuthenticatedUser): string {
  if (!user.clientId) {
    throw new ForbiddenException(
      'This account is not linked to a client and cannot access client data',
    );
  }

  return user.clientId;
}
