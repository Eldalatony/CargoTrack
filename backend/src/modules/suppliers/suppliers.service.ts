import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Supplier } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { Paginated, paginate } from '../../common/dto/pagination.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { QuerySuppliersDto } from './dto/query-suppliers.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateSupplierDto): Promise<Supplier> {
    return this.prisma.supplier.create({ data: dto });
  }

  async findAll(query: QuerySuppliersDto): Promise<Paginated<Supplier>> {
    const where: Prisma.SupplierWhereInput = {
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
      ...(query.country ? { country: query.country } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return paginate(data, total, query);
  }

  async findOne(id: string): Promise<Supplier> {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: { _count: { select: { productionOrders: true } } },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier ${id} not found`);
    }

    return supplier;
  }

  async update(id: string, dto: UpdateSupplierDto): Promise<Supplier> {
    await this.findOne(id);

    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  /** Blocked by the FK once production orders reference it — 409, not a wipe. */
  async remove(id: string): Promise<void> {
    await this.findOne(id);

    await this.prisma.supplier.delete({ where: { id } });
  }
}
