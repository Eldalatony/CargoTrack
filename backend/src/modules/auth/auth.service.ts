import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../prisma/prisma.service';
import {
  AuthenticatedUser,
  JwtPayload,
} from '../../common/types/authenticated-user';

/**
 * A valid bcrypt hash of a value nothing can match. Compared against when the
 * email is unknown so that "no such user" and "wrong password" take the same
 * time — otherwise the login endpoint doubles as a way to discover which
 * addresses have accounts.
 */
const DUMMY_HASH =
  '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.LrPuQmMlOWjXKPmPxvHwRmuprtHu';

export interface LoginResult {
  accessToken: string;
  expiresIn: string;
  user: AuthenticatedUser;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    const matches = await bcrypt.compare(
      password,
      user?.passwordHash ?? DUMMY_HASH,
    );

    if (!user || !matches) {
      this.logger.warn(`Failed login attempt for ${email}`);
      throw new UnauthorizedException('Invalid email or password');
    }

    const principal: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      clientId: user.clientId,
    };

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      clientId: user.clientId,
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      expiresIn: this.config.get<string>('JWT_EXPIRES_IN', '1d'),
      user: principal,
    };
  }
}
