import { Injectable, NotFoundException } from '@nestjs/common';
import { CustomsAgent, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { Paginated, paginate } from '../../common/dto/pagination.dto';
import { CreateCustomsAgentDto } from './dto/create-customs-agent.dto';
import { QueryCustomsAgentsDto } from './dto/query-customs-agents.dto';
import { UpdateCustomsAgentDto } from './dto/update-customs-agent.dto';

@Injectable()
export class CustomsAgentsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateCustomsAgentDto): Promise<CustomsAgent> {
    return this.prisma.customsAgent.create({ data: dto });
  }

  async findAll(
    query: QueryCustomsAgentsDto,
  ): Promise<Paginated<CustomsAgent>> {
    const where: Prisma.CustomsAgentWhereInput = {
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
      ...(query.country ? { country: query.country } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.customsAgent.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.customsAgent.count({ where }),
    ]);

    return paginate(data, total, query);
  }

  async findOne(id: string): Promise<CustomsAgent> {
    const agent = await this.prisma.customsAgent.findUnique({
      where: { id },
      include: { _count: { select: { containers: true } } },
    });

    if (!agent) {
      throw new NotFoundException(`Customs agent ${id} not found`);
    }

    return agent;
  }

  async update(id: string, dto: UpdateCustomsAgentDto): Promise<CustomsAgent> {
    await this.findOne(id);

    return this.prisma.customsAgent.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);

    await this.prisma.customsAgent.delete({ where: { id } });
  }
}
