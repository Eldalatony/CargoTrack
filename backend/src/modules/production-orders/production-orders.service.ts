import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  EntityType,
  OrderStatus,
  Prisma,
  ProductionOrder,
  ProductionOrderStatus,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { Paginated, paginate } from '../../common/dto/pagination.dto';
import { isClient, requireClientId } from '../../common/access/client-scope';
import { productionOrderStateMachine } from '../../common/state-machines/production-order.state-machine';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { StatusHistoryService } from '../status-history/status-history.service';
import { ChangeProductionOrderStatusDto } from './dto/change-production-order-status.dto';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { QueryProductionOrdersDto } from './dto/query-production-orders.dto';
import { UpdateProductionOrderDto } from './dto/update-production-order.dto';

/**
 * The order must be confirmed before a factory is engaged. On the state
 * diagram this is the deposit gate: roughly 20% clears, then production
 * starts. Phase 4 adds the payment half of that check here; the ordering half
 * is enforced now.
 */
const PLACEABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.ORDER_CONFIRMED,
  OrderStatus.FACTORY_CANNOT_FULFIL,
];

const DETAIL_INCLUDE = {
  supplier: { select: { id: true, name: true, country: true } },
  order: { select: { id: true, clientId: true, status: true } },
  inspections: { orderBy: { inspectedAt: 'asc' } },
} satisfies Prisma.ProductionOrderInclude;

@Injectable()
export class ProductionOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statusHistory: StatusHistoryService,
  ) {}

  async create(
    dto: CreateProductionOrderDto,
    user: AuthenticatedUser,
  ): Promise<ProductionOrder> {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      select: { id: true, status: true },
    });

    if (!order) {
      throw new BadRequestException(`Order ${dto.orderId} does not exist`);
    }

    if (!PLACEABLE_ORDER_STATUSES.includes(order.status)) {
      throw new UnprocessableEntityException(
        `Production can only be placed against a confirmed order. Order ${dto.orderId} is ${order.status}`,
      );
    }

    const supplier = await this.prisma.supplier.findUnique({
      where: { id: dto.supplierId },
      select: { id: true },
    });

    if (!supplier) {
      throw new BadRequestException(
        `Supplier ${dto.supplierId} does not exist`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const productionOrder = await tx.productionOrder.create({
        data: {
          orderId: dto.orderId,
          supplierId: dto.supplierId,
          agreedCost: new Prisma.Decimal(dto.agreedCost),
          currency: dto.currency,
          expectedReadyDate: dto.expectedReadyDate
            ? new Date(dto.expectedReadyDate)
            : null,
        },
        include: DETAIL_INCLUDE,
      });

      await this.statusHistory.record(tx, {
        entityType: EntityType.PRODUCTION_ORDER,
        entityId: productionOrder.id,
        fromStatus: null,
        toStatus: productionOrder.status,
        changedBy: user.id,
        reason: 'Production order placed with supplier',
      });

      return productionOrder;
    });
  }

  async findAll(
    query: QueryProductionOrdersDto,
    user: AuthenticatedUser,
  ): Promise<Paginated<ProductionOrder>> {
    const where: Prisma.ProductionOrderWhereInput = {
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.status ? { status: query.status } : {}),
      // Reached through the parent order, which is what carries the client.
      ...(isClient(user) ? { order: { clientId: requireClientId(user) } } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.productionOrder.findMany({
        where,
        include: DETAIL_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.productionOrder.count({ where }),
    ]);

    return paginate(data, total, query);
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<ProductionOrder> {
    const productionOrder = await this.prisma.productionOrder.findFirst({
      where: { id, ...this.scope(user) },
      include: DETAIL_INCLUDE,
    });

    if (!productionOrder) {
      throw new NotFoundException(`Production order ${id} not found`);
    }

    return productionOrder;
  }

  async update(
    id: string,
    dto: UpdateProductionOrderDto,
  ): Promise<ProductionOrder> {
    await this.requireProductionOrder(id);

    return this.prisma.productionOrder.update({
      where: { id },
      data: {
        ...(dto.agreedCost === undefined
          ? {}
          : { agreedCost: new Prisma.Decimal(dto.agreedCost) }),
        ...(dto.currency === undefined ? {} : { currency: dto.currency }),
        ...(dto.expectedReadyDate === undefined
          ? {}
          : { expectedReadyDate: new Date(dto.expectedReadyDate) }),
        ...(dto.actualReceivedDate === undefined
          ? {}
          : { actualReceivedDate: new Date(dto.actualReceivedDate) }),
      },
      include: DETAIL_INCLUDE,
    });
  }

  /**
   * Same shape as the order transition: validate, compare-and-swap, and
   * write the history row in the same transaction. Production orders are a
   * supporting lifecycle, but they are audited exactly like the headline one.
   */
  async changeStatus(
    id: string,
    dto: ChangeProductionOrderStatusDto,
    user: AuthenticatedUser,
  ): Promise<ProductionOrder> {
    const productionOrder = await this.requireProductionOrder(id);

    productionOrderStateMachine.assert(productionOrder.status, dto.status);

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.productionOrder.updateMany({
        where: { id, status: productionOrder.status },
        data: {
          status: dto.status,
          // Receiving the batch is what the date means, so it is stamped by
          // the transition rather than typed in beside it.
          ...(dto.status === ProductionOrderStatus.RECEIVED &&
          !productionOrder.actualReceivedDate
            ? { actualReceivedDate: new Date() }
            : {}),
        },
      });

      if (count === 0) {
        throw new ConflictException(
          `Production order ${id} changed status while this request was in flight`,
        );
      }

      await this.statusHistory.record(tx, {
        entityType: EntityType.PRODUCTION_ORDER,
        entityId: id,
        fromStatus: productionOrder.status,
        toStatus: dto.status,
        changedBy: user.id,
        reason: dto.reason,
      });

      return tx.productionOrder.findUniqueOrThrow({
        where: { id },
        include: DETAIL_INCLUDE,
      });
    });
  }

  async remove(id: string): Promise<void> {
    const productionOrder = await this.requireProductionOrder(id);

    if (productionOrder.status !== ProductionOrderStatus.PENDING) {
      throw new UnprocessableEntityException(
        `Only a PENDING production order can be deleted. ${id} is ${productionOrder.status} — cancel it instead`,
      );
    }

    await this.prisma.productionOrder.delete({ where: { id } });
  }

  private scope(user: AuthenticatedUser): Prisma.ProductionOrderWhereInput {
    return isClient(user) ? { order: { clientId: requireClientId(user) } } : {};
  }

  private async requireProductionOrder(id: string): Promise<ProductionOrder> {
    const productionOrder = await this.prisma.productionOrder.findUnique({
      where: { id },
    });

    if (!productionOrder) {
      throw new NotFoundException(`Production order ${id} not found`);
    }

    return productionOrder;
  }
}
