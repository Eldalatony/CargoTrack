import { Injectable, NotFoundException } from '@nestjs/common';
import { Client, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { Paginated, paginate } from '../../common/dto/pagination.dto';
import { isClient, requireClientId } from '../../common/access/client-scope';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreateClientDto } from './dto/create-client.dto';
import { QueryClientsDto } from './dto/query-clients.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateClientDto): Promise<Client> {
    return this.prisma.client.create({ data: dto });
  }

  async findAll(
    query: QueryClientsDto,
    user: AuthenticatedUser,
  ): Promise<Paginated<Client>> {
    const where: Prisma.ClientWhereInput = {
      // A client principal is not browsing a directory of clients — the list
      // collapses to the single row they are attached to.
      ...(isClient(user) ? { id: requireClientId(user) } : {}),
      ...(query.search
        ? { companyName: { contains: query.search, mode: 'insensitive' } }
        : {}),
      ...(query.isConsolidator === undefined
        ? {}
        : { isConsolidator: query.isConsolidator }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        orderBy: { companyName: 'asc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.client.count({ where }),
    ]);

    return paginate(data, total, query);
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<Client> {
    // Checked before the query, not spread into it: a `{ id, ...{ id } }`
    // where-clause silently answers with the caller's own row instead of
    // refusing, which looks like scoping working and is not.
    if (isClient(user) && requireClientId(user) !== id) {
      throw new NotFoundException(`Client ${id} not found`);
    }

    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        documents: {
          select: {
            id: true,
            docType: true,
            uploadedAt: true,
            retentionExpiresAt: true,
          },
        },
        _count: { select: { orders: true } },
      },
    });

    if (!client) {
      throw new NotFoundException(`Client ${id} not found`);
    }

    return client;
  }

  async update(id: string, dto: UpdateClientDto): Promise<Client> {
    await this.assertExists(id);

    return this.prisma.client.update({ where: { id }, data: dto });
  }

  /**
   * Deleting a client with orders behind it is rejected by the FK
   * (onDelete: Restrict) and surfaces as 409 — history is not disposable.
   */
  async remove(id: string): Promise<void> {
    await this.assertExists(id);

    await this.prisma.client.delete({ where: { id } });
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.prisma.client.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException(`Client ${id} not found`);
    }
  }
}
