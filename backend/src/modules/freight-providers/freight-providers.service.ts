import { Injectable, NotFoundException } from '@nestjs/common';
import { FreightProvider, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { Paginated, paginate } from '../../common/dto/pagination.dto';
import { CreateFreightProviderDto } from './dto/create-freight-provider.dto';
import { QueryFreightProvidersDto } from './dto/query-freight-providers.dto';
import { UpdateFreightProviderDto } from './dto/update-freight-provider.dto';

@Injectable()
export class FreightProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateFreightProviderDto): Promise<FreightProvider> {
    return this.prisma.freightProvider.create({ data: dto });
  }

  async findAll(
    query: QueryFreightProvidersDto,
  ): Promise<Paginated<FreightProvider>> {
    const where: Prisma.FreightProviderWhereInput = {
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
      ...(query.country ? { country: query.country } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.freightProvider.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.freightProvider.count({ where }),
    ]);

    return paginate(data, total, query);
  }

  async findOne(id: string): Promise<FreightProvider> {
    const provider = await this.prisma.freightProvider.findUnique({
      where: { id },
      include: { _count: { select: { containers: true } } },
    });

    if (!provider) {
      throw new NotFoundException(`Freight provider ${id} not found`);
    }

    return provider;
  }

  async update(
    id: string,
    dto: UpdateFreightProviderDto,
  ): Promise<FreightProvider> {
    await this.findOne(id);

    return this.prisma.freightProvider.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);

    await this.prisma.freightProvider.delete({ where: { id } });
  }
}
