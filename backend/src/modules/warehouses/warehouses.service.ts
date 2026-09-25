import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockStatus, Warehouse } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { Paginated, paginate } from '../../common/dto/pagination.dto';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { QueryWarehousesDto } from './dto/query-warehouses.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateWarehouseDto): Promise<Warehouse> {
    return this.prisma.warehouse.create({ data: dto });
  }

  async findAll(query: QueryWarehousesDto): Promise<Paginated<Warehouse>> {
    const where: Prisma.WarehouseWhereInput = {
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
      ...(query.country ? { country: query.country } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.warehouse.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.warehouse.count({ where }),
    ]);

    return paginate(data, total, query);
  }

  /** With a count of what is physically there now, held or not. */
  async findOne(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            stockRecords: {
              where: {
                status: { in: [StockStatus.IN_STOCK, StockStatus.ON_HOLD] },
              },
            },
          },
        },
      },
    });

    if (!warehouse) {
      throw new NotFoundException(`Warehouse ${id} not found`);
    }

    return warehouse;
  }

  async update(id: string, dto: UpdateWarehouseDto): Promise<Warehouse> {
    await this.findOne(id);

    return this.prisma.warehouse.update({ where: { id }, data: dto });
  }

  /** Blocked by the FK once stock has passed through it — 409, not a wipe. */
  async remove(id: string): Promise<void> {
    await this.findOne(id);

    await this.prisma.warehouse.delete({ where: { id } });
  }
}
