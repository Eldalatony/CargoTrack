import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../../prisma/prisma.service';
import {
  AuthenticatedUser,
  JwtPayload,
} from '../../common/types/authenticated-user';

/**
 * Rebuilds the principal from the database on every request.
 *
 * The token is proof of identity, not a cache of authority: reading role and
 * client_id from the row means revoking a user or moving them between clients
 * takes effect on the next request instead of whenever their token expires.
 * One indexed primary-key lookup is a fair price for that.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        clientId: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('This account no longer exists');
    }

    return user;
  }
}
