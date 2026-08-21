import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opts a route out of the globally applied JwtAuthGuard.
 *
 * Authentication is on by default for every route in the application; this is
 * the only way off, which keeps "did we remember to guard this?" from being a
 * question anyone has to ask per controller.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
