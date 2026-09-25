import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  CounterpartyType,
  EntityType,
  Order,
  OrderStatus,
  PaymentDirection,
  PaymentType,
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
import { PAYMENT_PAID, guardFailed } from '../payments/payment-status';
import { Settlement, loadSettlement } from '../payments/settlement';
import { StatusHistoryService } from '../status-history/status-history.service';
import {
  CreateOrderDto,
  DEPOSIT_PERCENTAGE_DEFAULT,
} from './dto/create-order.dto';
import {
  ChangeOrderStatusDto,
  ConfirmationDepositDto,
} from './dto/change-order-status.dto';
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

  /**
   * The order plus where it stands with the client's money. Settlement is
   * safe to show a client — it only ever counts their own payments — which
   * is what lets the portal say "4,800 USD outstanding" beside a withheld
   * document instead of just a missing button.
   */
  async findOne(
    id: string,
    user: AuthenticatedUser,
  ): Promise<Order & { settlement: Settlement }> {
    const order = await this.prisma.order.findFirst({
      where: { id, ...scopeWhere(user) },
      include: DETAIL_INCLUDE,
    });

    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    const settlement = await loadSettlement(this.prisma, id);

    return { ...order, settlement: settlement! };
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

    if (dto.deposit) {
      if (dto.status !== OrderStatus.ORDER_CONFIRMED) {
        throw new BadRequestException(
          'A deposit can only be recorded together with status ORDER_CONFIRMED',
        );
      }

      if (dto.deposit.paidAt && new Date(dto.deposit.paidAt) > new Date()) {
        throw new BadRequestException('A deposit cannot be paid in the future');
      }
    }

    orderStateMachine.assert(order.status, dto.status);
    await this.assertPreconditionsFor(order, dto.status);

    return this.prisma.$transaction(async (tx) => {
      await this.applyTransition(tx, order, dto.status, user, dto.reason);

      if (dto.deposit) {
        await this.recordConfirmationDeposit(tx, order, dto.deposit, user);
      }

      return tx.order.findUniqueOrThrow({
        where: { id },
        include: DETAIL_INCLUDE,
      });
    });
  }

  /**
   * Writes one approved transition: the status column and its history row,
   * in the caller's transaction. Preconditions are the caller's job — this is
   * shared with PaymentsService, which moves DOCUMENTS_WITHHELD to CLOSED_OUT
   * the moment the final payment clears, and has already proved the money.
   */
  async applyTransition(
    tx: Prisma.TransactionClient,
    order: Pick<Order, 'id' | 'status'>,
    to: OrderStatus,
    user: AuthenticatedUser,
    reason?: string | null,
  ): Promise<void> {
    orderStateMachine.assert(order.status, to);

    // Compare-and-swap against the status that was validated. Two managers
    // advancing the same order at once would otherwise both pass their checks
    // and write two history rows for what is really one move.
    const { count } = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: {
        status: to,
        ...(to === OrderStatus.CLOSED_OUT ? { closedAt: new Date() } : {}),
      },
    });

    if (count === 0) {
      throw new ConflictException(
        `Order ${order.id} changed status while this request was in flight. Re-read it and retry against its current status`,
      );
    }

    await this.statusHistory.record(tx, {
      entityType: EntityType.ORDER,
      entityId: order.id,
      fromStatus: order.status,
      toStatus: to,
      changedBy: user.id,
      reason,
    });
  }

  /** "Deposit recorded on order confirmation" — one transaction, both facts. */
  private async recordConfirmationDeposit(
    tx: Prisma.TransactionClient,
    order: Order,
    deposit: ConfirmationDepositDto,
    user: AuthenticatedUser,
  ): Promise<void> {
    const payment = await tx.payment.create({
      data: {
        orderId: order.id,
        paymentType: PaymentType.DEPOSIT,
        direction: PaymentDirection.INBOUND,
        counterpartyType: CounterpartyType.CLIENT,
        counterpartyId: order.clientId,
        amount: new Prisma.Decimal(deposit.amount),
        currency: order.currency,
        paidAt: deposit.paidAt ? new Date(deposit.paidAt) : new Date(),
        reference: deposit.reference ?? null,
      },
    });

    await this.statusHistory.record(tx, {
      entityType: EntityType.PAYMENT,
      entityId: payment.id,
      fromStatus: null,
      toStatus: PAYMENT_PAID,
      changedBy: user.id,
      reason: 'Deposit recorded on order confirmation',
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
      // The deposit gate, where the state diagram draws it: roughly a fifth
      // clears before the goods are taken in.
      const settlement = await this.settlementOf(order.id);

      if (!settlement.depositMet) {
        throw guardFailed(
          'deposit',
          `The deposit must clear before goods are received: ${settlement.depositRequired.toFixed(2)} ${settlement.currency} required, ${settlement.depositReceived.toFixed(2)} received`,
        );
      }

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

    const balanceGated =
      order.status === OrderStatus.DELIVERED ||
      order.status === OrderStatus.DOCUMENTS_WITHHELD;

    if (to === OrderStatus.CLOSED_OUT && balanceGated) {
      // The balance gate. Closing out is when the documents go to the client,
      // so it waits for the same money the document release gate does.
      // (QC_REJECTED -> CLOSED_OUT is the refund path and owes nothing.)
      const settlement = await this.settlementOf(order.id);

      if (!settlement.paidInFull) {
        throw guardFailed(
          'balance',
          `The order cannot close out with ${settlement.balanceDue.toFixed(2)} ${settlement.currency} outstanding. Record the balance payment, or move it to DOCUMENTS_WITHHELD`,
        );
      }
    }

    if (to === OrderStatus.DOCUMENTS_WITHHELD) {
      const settlement = await this.settlementOf(order.id);

      if (settlement.paidInFull) {
        throw new UnprocessableEntityException(
          'This order is paid in full — there is nothing to withhold documents for. Close it out instead',
        );
      }
    }
  }

  private async settlementOf(orderId: string): Promise<Settlement> {
    const settlement = await loadSettlement(this.prisma, orderId);

    if (!settlement) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    return settlement;
  }

  /**
   * The hard rule from the roadmap: the client signs the QC sheet in person,
   * and nothing downstream of that signature may happen without it. No
   * sign-off, no balance invoice — and no shipment booking either.
   *
   * PaymentsService calls this same check before raising a balance invoice.
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
      throw guardFailed(
        'qc_signoff',
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
