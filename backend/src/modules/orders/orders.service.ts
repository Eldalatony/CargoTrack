import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  EntityType,
  Order,
  OrderStatus,
  Prisma,
  ProductionOrderStatus,
  QcOutcome,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { Paginated, paginate } from '../../common/dto/pagination.dto';
import { isClient, scopeWhere } from '../../common/access/client-scope';
import {
  ORDER_FINAL_STATUSES,
  orderStateMachine,
} from '../../common/state-machines/order.state-machine';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { StatusHistoryService } from '../status-history/status-history.service';
import {
  CreateOrderDto,
  DEPOSIT_PERCENTAGE_DEFAULT,
} from './dto/create-order.dto';
import { ChangeOrderStatusDto } from './dto/change-order-status.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { orderTotals } from './order-totals';

const DETAIL_INCLUDE = {
  client: { select: { id: true, companyName: true, country: true } },
  items: { orderBy: { createdAt: 'asc' } },
  productionOrders: {
    include: {
      supplier: { select: { id: true, name: true, country: true } },
      inspections: { orderBy: { inspectedAt: 'asc' } },
    },
  },
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statusHistory: StatusHistoryService,
  ) {}

  async create(dto: CreateOrderDto, user: AuthenticatedUser): Promise<Order> {
    const client = await this.prisma.client.findUnique({
      where: { id: dto.clientId },
      select: { id: true },
    });

    if (!client) {
      throw new BadRequestException(`Client ${dto.clientId} does not exist`);
    }

    const totals = orderTotals(dto.items ?? []);

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          clientId: dto.clientId,
          agreedPrice: new Prisma.Decimal(dto.agreedPrice),
          currency: dto.currency,
          depositPercentage: new Prisma.Decimal(
            dto.depositPercentage ?? DEPOSIT_PERCENTAGE_DEFAULT,
          ),
          requiredBy: dto.requiredBy ? new Date(dto.requiredBy) : null,
          totalCbm: totals.totalCbm,
          totalWeightKg: totals.totalWeightKg,
          items: dto.items?.length
            ? {
                create: dto.items.map((item) => ({
                  description: item.description,
                  category: item.category ?? null,
                  quantity: item.quantity,
                  unitCbm: new Prisma.Decimal(item.unitCbm),
                  unitWeightKg: new Prisma.Decimal(item.unitWeightKg),
                  unitPrice: new Prisma.Decimal(item.unitPrice),
                })),
              }
            : undefined,
        },
        include: DETAIL_INCLUDE,
      });

      // The trail starts at creation, not at the first transition. An order
      // with no history rows would otherwise read as one nobody has touched.
      await this.statusHistory.record(tx, {
        entityType: EntityType.ORDER,
        entityId: order.id,
        fromStatus: null,
        toStatus: order.status,
        changedBy: user.id,
        reason: 'Order placed',
      });

      return order;
    });
  }

  async findAll(
    query: QueryOrdersDto,
    user: AuthenticatedUser,
  ): Promise<Paginated<Order>> {
    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      // A client filtering by another client's id still gets their own rows:
      // the scope is applied last and comes from the principal, not the query.
      ...(!isClient(user) && query.clientId
        ? { clientId: query.clientId }
        : {}),
      ...scopeWhere(user),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: {
          client: { select: { id: true, companyName: true } },
          _count: { select: { items: true } },
        },
        orderBy: { placedAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return paginate(data, total, query);
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<Order> {
    const order = await this.prisma.order.findFirst({
      where: { id, ...scopeWhere(user) },
      include: DETAIL_INCLUDE,
    });

    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    return order;
  }

  async update(id: string, dto: UpdateOrderDto): Promise<Order> {
    const order = await this.requireOrder(id);

    if (ORDER_FINAL_STATUSES.includes(order.status)) {
      throw new UnprocessableEntityException(
        `Order ${id} is ${order.status} and can no longer be edited`,
      );
    }

    return this.prisma.order.update({
      where: { id },
      data: {
        ...(dto.agreedPrice === undefined
          ? {}
          : { agreedPrice: new Prisma.Decimal(dto.agreedPrice) }),
        ...(dto.currency === undefined ? {} : { currency: dto.currency }),
        ...(dto.depositPercentage === undefined
          ? {}
          : { depositPercentage: new Prisma.Decimal(dto.depositPercentage) }),
        ...(dto.requiredBy === undefined
          ? {}
          : { requiredBy: new Date(dto.requiredBy) }),
      },
      include: DETAIL_INCLUDE,
    });
  }

  /**
   * The one door status moves through.
   *
   * Three things happen here, together: the transition table approves the
   * move, the business preconditions for the target state are checked, and
   * the status column plus its history row are written in one transaction.
   */
  async changeStatus(
    id: string,
    dto: ChangeOrderStatusDto,
    user: AuthenticatedUser,
  ): Promise<Order> {
    const order = await this.requireOrder(id);

    orderStateMachine.assert(order.status, dto.status);
    await this.assertPreconditionsFor(order, dto.status);

    return this.prisma.$transaction(async (tx) => {
      // Compare-and-swap against the status we validated. Two managers
      // advancing the same order at once would otherwise both pass the checks
      // above and write two history rows for what is really one move.
      const { count } = await tx.order.updateMany({
        where: { id, status: order.status },
        data: {
          status: dto.status,
          ...(dto.status === OrderStatus.CLOSED_OUT
            ? { closedAt: new Date() }
            : {}),
        },
      });

      if (count === 0) {
        throw new ConflictException(
          `Order ${id} changed status while this request was in flight. Re-read it and retry against its current status`,
        );
      }

      await this.statusHistory.record(tx, {
        entityType: EntityType.ORDER,
        entityId: id,
        fromStatus: order.status,
        toStatus: dto.status,
        changedBy: user.id,
        reason: dto.reason,
      });

      return tx.order.findUniqueOrThrow({
        where: { id },
        include: DETAIL_INCLUDE,
      });
    });
  }

  async statusHistoryFor(id: string, user: AuthenticatedUser) {
    await this.requireVisibleOrder(id, user);

    return this.statusHistory.findForEntity(EntityType.ORDER, id);
  }

  /**
   * Only ever a correction to a mistyped order. Once an order has moved past
   * ORDER_PLACED it has history worth keeping, and the way to end it is
   * CANCELLED, a state on the diagram, not a DELETE.
   */
  async remove(id: string): Promise<void> {
    const order = await this.requireOrder(id);

    if (order.status !== OrderStatus.ORDER_PLACED) {
      throw new UnprocessableEntityException(
        `Only an order still in ORDER_PLACED can be deleted. Order ${id} is ${order.status} — cancel it instead`,
      );
    }

    await this.prisma.order.delete({ where: { id } });
  }

  /**
   * Preconditions the transition table cannot express, because they are about
   * the rest of the order rather than about its current state.
   */
  private async assertPreconditionsFor(
    order: Order,
    to: OrderStatus,
  ): Promise<void> {
    if (to === OrderStatus.ORDER_CONFIRMED) {
      const items = await this.prisma.orderItem.count({
        where: { orderId: order.id },
      });

      if (items === 0) {
        throw new UnprocessableEntityException(
          'An order cannot be confirmed before it has at least one item — there would be nothing to produce or ship',
        );
      }
    }

    if (to === OrderStatus.GOODS_RECEIVED) {
      const received = await this.prisma.productionOrder.count({
        where: { orderId: order.id, status: ProductionOrderStatus.RECEIVED },
      });

      if (received === 0) {
        throw new UnprocessableEntityException(
          'Goods cannot be marked received until at least one production order for this order is RECEIVED',
        );
      }
    }

    if (to === OrderStatus.SHIPMENT_BOOKING) {
      await this.assertQcSignedOff(order.id);
    }

    // DELIVERED -> CLOSED_OUT is payment-gated on the state diagram. Payments
    // arrive in Phase 4, which is where that check lands (Gate 4), alongside
    // the document release it controls.
  }

  /**
   * The hard rule from the roadmap: the client signs the QC sheet in person,
   * and nothing downstream of that signature may happen without it. No
   * sign-off, no balance invoice — and no shipment booking either.
   *
   * Phase 4 calls this same check before raising a balance invoice.
   */
  async assertQcSignedOff(orderId: string): Promise<void> {
    const signedOff = await this.prisma.qcInspection.count({
      where: {
        productionOrder: { orderId },
        clientSignedOffAt: { not: null },
        outcome: { in: [QcOutcome.PASSED, QcOutcome.PARTIAL] },
      },
    });

    if (signedOff === 0) {
      throw new UnprocessableEntityException(
        'A passed QC inspection signed off by the client is required before this order can proceed',
      );
    }
  }

  /** Recomputes total_cbm / total_weight_kg from the current lines. */
  async refreshTotals(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<void> {
    const items = await tx.orderItem.findMany({
      where: { orderId },
      select: { quantity: true, unitCbm: true, unitWeightKg: true },
    });

    const totals = orderTotals(items);

    await tx.order.update({
      where: { id: orderId },
      data: {
        totalCbm: totals.totalCbm,
        totalWeightKg: totals.totalWeightKg,
      },
    });
  }

  private async requireOrder(id: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({ where: { id } });

    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    return order;
  }

  /** Same as requireOrder, but a client sees only their own — otherwise 404. */
  async requireVisibleOrder(
    id: string,
    user: AuthenticatedUser,
  ): Promise<Order> {
    const order = await this.prisma.order.findFirst({
      where: { id, ...scopeWhere(user) },
    });

    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    return order;
  }
}
