import { UserRole } from '@prisma/client';

/**
 * The request principal, attached to `req.user` by JwtStrategy.
 *
 * It is rebuilt from the database on every request rather than trusted from
 * the token body: a role change or a deleted user must take effect
 * immediately, not whenever the token happens to expire.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /**
   * Non-null only for CLIENT users. This is the data-scoping anchor — every
   * client-visible query is filtered by it, and no request body can influence
   * it.
   */
  clientId: string | null;
}

/** Body of the signed JWT. Deliberately minimal. */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  clientId: string | null;
}
