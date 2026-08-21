import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../prisma/prisma.service';
import {
  PaginationQueryDto,
  Paginated,
  paginate,
} from '../../common/dto/pagination.dto';
import { CreateUserDto } from './dto/create-user.dto';

const BCRYPT_ROUNDS = 10;

/**
 * Never selects password_hash. The column exists for exactly one comparison,
 * in AuthService, and there is no read path that can leak it into a response.
 */
const SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  clientId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type SafeUser = Prisma.UserGetPayload<{ select: typeof SAFE_SELECT }>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto): Promise<SafeUser> {
    await this.assertRoleAndClientAgree(dto);

    return this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email.toLowerCase().trim(),
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
        role: dto.role,
        clientId: dto.role === UserRole.CLIENT ? dto.clientId : null,
      },
      select: SAFE_SELECT,
    });
  }

  async findAll(query: PaginationQueryDto): Promise<Paginated<SafeUser>> {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        select: SAFE_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.user.count(),
    ]);

    return paginate(data, total, query);
  }

  async findOne(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: SAFE_SELECT,
    });

    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    return user;
  }

  /**
   * client_id is what every scoped query filters on, so the two fields cannot
   * be allowed to disagree: a CLIENT without one would see nothing, and an
   * Office Manager with one would look scoped while being anything but.
   */
  private async assertRoleAndClientAgree(dto: CreateUserDto): Promise<void> {
    if (dto.role === UserRole.CLIENT) {
      if (!dto.clientId) {
        throw new BadRequestException('clientId is required for CLIENT users');
      }

      const client = await this.prisma.client.findUnique({
        where: { id: dto.clientId },
        select: { id: true },
      });

      if (!client) {
        throw new BadRequestException(`Client ${dto.clientId} does not exist`);
      }

      return;
    }

    if (dto.clientId) {
      throw new BadRequestException(
        'clientId must be omitted for OFFICE_MANAGER users',
      );
    }
  }
}
