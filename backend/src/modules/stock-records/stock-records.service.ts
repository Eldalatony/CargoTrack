import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EntityType, Prisma, StockRecord, StockStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { Paginated, paginate } from '../../common/dto/pagination.dto';
import { stockRecordStateMachine } from '../../common/state-machines/stock-record.state-machine';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { StatusHistoryService } from '../status-history/status-history.service';
import { CreateStockRecordDto } from './dto/create-stock-record.dto';
import { QueryStockRecordsDto } from './dto/query-stock-records.dto';

const INCLUDE = {
  warehouse: { select: { id: true, name: true, country: true } },
  orderItem: {
    select: {
      id: true,
      description: true,
      quantity: true,
      order: {
        select: {
          id: true,
          status: true,
          client: { select: { id: true, companyName: true } },
        },
      },
    },
  },
} satisfies Prisma.StockRecordInclude;

/** Physically in a warehouse right now, whether or not it is held. */
const ON_SITE: StockStatus[] = [StockStatus.IN_STOCK, StockStatus.ON_HOLD];

interface Transition {
  to: StockStatus;
  data: Prisma.StockRecordUpdateManyMutationInput;
  reason: string;
}

@Injectable()
export class StockRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statusHistory: StatusHistoryService,
  ) {}

  async create(
    dto: CreateStockRecordDto,
    user: AuthenticatedUser,
  ): Promise<StockRecord> {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.warehouseId },
      select: { id: true },
    });

    if (!warehouse) {
      throw new BadRequestException(
        `Warehouse ${dto.warehouseId} does not exist`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Lock the order line so two receipts logged at once cannot both fit
      // under its quantity.
      const locked = await tx.$queryRaw<{ quantity: number }[]>`
        SELECT quantity FROM order_items WHERE id = ${dto.orderItemId}::uuid FOR UPDATE
      `;

      if (locked.length === 0) {
        throw new BadRequestException(
          `Order item ${dto.orderItemId} does not exist`,
        );
      }

      const ordered = locked[0].quantity;

      const { _sum } = await tx.stockRecord.aggregate({
        where: { orderItemId: dto.orderItemId, status: { in: ON_SITE } },
        _sum: { quantity: true },
      });

      const onSite = _sum.quantity ?? 0;

      if (onSite + dto.quantity > ordered) {
        throw new UnprocessableEntityException(
          `Only ${ordered} units were ordered on this line and ${onSite} are already in a warehouse — ${dto.quantity} more would exceed it`,
        );
      }

      const record = await tx.stockRecord.create({
        data: {
          warehouseId: dto.warehouseId,
          orderItemId: dto.orderItemId,
          quantity: dto.quantity,
          ...(dto.receivedAt ? { receivedAt: new Date(dto.receivedAt) } : {}),
        },
        include: INCLUDE,
      });

      await this.statusHistory.record(tx, {
        entityType: EntityType.STOCK_RECORD,
        entityId: record.id,
        fromStatus: null,
        toStatus: record.status,
        changedBy: user.id,
        reason: 'Goods received into warehouse',
      });

      return record;
    });
  }

  async findAll(query: QueryStockRecordsDto): Promise<Paginated<StockRecord>> {
    const where: Prisma.StockRecordWhereInput = {
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.orderId ? { orderItem: { orderId: query.orderId } } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.stockRecord.findMany({
        where,
        include: INCLUDE,
        orderBy: { receivedAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.stockRecord.count({ where }),
    ]);

    return paginate(data, total, query);
  }

  async findOne(id: string): Promise<StockRecord> {
    const record = await this.prisma.stockRecord.findUnique({
      where: { id },
      include: INCLUDE,
    });

    if (!record) {
      throw new NotFoundException(`Stock record ${id} not found`);
    }

    return record;
  }

  async statusHistoryFor(id: string) {
    await this.findOne(id);

    return this.statusHistory.findForEntity(EntityType.STOCK_RECORD, id);
  }

  hold(
    id: string,
    holdReason: string,
    user: AuthenticatedUser,
  ): Promise<StockRecord> {
    return this.transition(id, user, {
      to: StockStatus.ON_HOLD,
      data: { holdReason },
      reason: holdReason,
    });
  }

  /**
   * The hold is over but the goods stay put. hold_reason is cleared on the
   * row; the history keeps what it was and how long it lasted.
   */
  liftHold(
    id: string,
    reason: string | undefined,
    user: AuthenticatedUser,
  ): Promise<StockRecord> {
    return this.transition(id, user, {
      to: StockStatus.IN_STOCK,
      data: { holdReason: null },
      reason: reason ?? 'Hold lifted',
    });
  }

  /**
   * The goods leave. hold_reason is kept if there was one: received_at to
   * released_at on a held record is exactly the seasonal hold the office
   * wants to measure.
   */
  release(
    id: string,
    reason: string | undefined,
    user: AuthenticatedUser,
  ): Promise<StockRecord> {
    return this.transition(id, user, {
      to: StockStatus.RELEASED,
      data: { releasedAt: new Date() },
      reason: reason ?? 'Released from warehouse',
    });
  }

  /** Validate, compare-and-swap, history row — the same shape as orders. */
  private async transition(
    id: string,
    user: AuthenticatedUser,
    { to, data, reason }: Transition,
  ): Promise<StockRecord> {
    const record = await this.prisma.stockRecord.findUnique({ where: { id } });

    if (!record) {
      throw new NotFoundException(`Stock record ${id} not found`);
    }

    stockRecordStateMachine.assert(record.status, to);

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.stockRecord.updateMany({
        where: { id, status: record.status },
        data: { ...data, status: to },
      });

      if (count === 0) {
        throw new ConflictException(
          `Stock record ${id} changed status while this request was in flight`,
        );
      }

      await this.statusHistory.record(tx, {
        entityType: EntityType.STOCK_RECORD,
        entityId: id,
        fromStatus: record.status,
        toStatus: to,
        changedBy: user.id,
        reason,
      });

      return tx.stockRecord.findUniqueOrThrow({
        where: { id },
        include: INCLUDE,
      });
    });
  }
}
