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
  Payment,
  PaymentDirection,
  PaymentType,
  Prisma,
} from '@prisma/client';

import { isClient, requireClientId } from '../../common/access/client-scope';
import { Paginated, paginate } from '../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { lockOrder } from '../orders/order-lock';
import { OrdersService } from '../orders/orders.service';
import { StatusHistoryService } from '../status-history/status-history.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { MarkPaidDto } from './dto/mark-paid.dto';
import { QueryPaymentsDto } from './dto/query-payments.dto';
import {
  PAYMENT_OUTSTANDING,
  PAYMENT_PAID,
  PAYMENT_VOIDED,
} from './payment-status';
import { CLIENT_PAYMENT_TYPES, Settlement, loadSettlement } from './settlement';

/** Client money has one right direction per type. */
const CLIENT_DIRECTION: Partial<Record<PaymentType, PaymentDirection>> = {
  [PaymentType.DEPOSIT]: PaymentDirection.INBOUND,
  [PaymentType.BALANCE]: PaymentDirection.INBOUND,
  [PaymentType.REFUND]: PaymentDirection.OUTBOUND,
};

interface Counterparty {
  direction: PaymentDirection;
  counterpartyType: CounterpartyType;
  counterpartyId: string;
}

/**
 * The payments ledger, and the lever that opens the document release gate.
 *
 * A payment row is an invoice until `paid_at` is set, and money once it is.
 * Clearing client money is the moment the business rules downstream wake up:
 * if the order is now paid in full, every withheld document on it is
 * released, and an order sitting in DOCUMENTS_WITHHELD closes out — "it loops
 * forward to CLOSED_OUT the moment the final payment clears".
 *
 * Both happen in the same transaction as the payment, under the order lock,
 * so there is no moment at which the money is recorded and the documents
 * still say otherwise.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statusHistory: StatusHistoryService,
    private readonly orders: OrdersService,
    private readonly documents: DocumentsService,
  ) {}

  async create(
    dto: CreatePaymentDto,
    user: AuthenticatedUser,
  ): Promise<Payment> {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
    });

    if (!order) {
      throw new BadRequestException(`Order ${dto.orderId} does not exist`);
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new UnprocessableEntityException(
        `Order ${order.id} is CANCELLED; record a refund against it only if money was taken`,
      );
    }

    const counterparty = await this.counterpartyFor(dto, order);

    if (CLIENT_PAYMENT_TYPES.includes(dto.paymentType)) {
      // The settlement only counts client money in the order currency. A
      // deposit in another currency would silently not count towards the
      // gate, so it is refused here instead of being ignored there.
      if (dto.currency !== order.currency) {
        throw new UnprocessableEntityException(
          `${dto.paymentType} must be in the order currency (${order.currency}), not ${dto.currency}`,
        );
      }
    }

    if (dto.paymentType === PaymentType.BALANCE) {
      // The hard rule: the client signs the QC sheet, then the balance
      // invoice may be raised. Not before.
      await this.orders.assertQcSignedOff(order.id);
    }

    const paidAt = this.paidAtFrom(dto.paidAt);

    return this.prisma.$transaction(async (tx) => {
      await lockOrder(tx, order.id);

      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          paymentType: dto.paymentType,
          ...counterparty,
          amount: new Prisma.Decimal(dto.amount),
          currency: dto.currency,
          fxRate:
            dto.fxRate === undefined ? null : new Prisma.Decimal(dto.fxRate),
          paidAt,
          reference: dto.reference ?? null,
        },
      });

      await this.statusHistory.record(tx, {
        entityType: EntityType.PAYMENT,
        entityId: payment.id,
        fromStatus: null,
        toStatus: paidAt ? PAYMENT_PAID : PAYMENT_OUTSTANDING,
        changedBy: user.id,
        reason: `${dto.paymentType} ${payment.amount.toFixed(2)} ${payment.currency} ${paidAt ? 'received' : 'invoiced'}`,
      });

      if (paidAt) {
        await this.afterClearing(tx, payment, user);
      }

      return payment;
    });
  }

  async findAll(
    query: QueryPaymentsDto,
    user: AuthenticatedUser,
  ): Promise<Paginated<Payment>> {
    const where: Prisma.PaymentWhereInput = {
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...(query.paymentType ? { paymentType: query.paymentType } : {}),
      ...(query.direction ? { direction: query.direction } : {}),
      ...(query.outstanding === undefined
        ? {}
        : { paidAt: query.outstanding ? null : { not: null } }),
      ...this.scope(user),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return paginate(data, total, query);
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<Payment> {
    const payment = await this.prisma.payment.findFirst({
      where: { id, ...this.scope(user) },
    });

    if (!payment) {
      throw new NotFoundException(`Payment ${id} not found`);
    }

    return payment;
  }

  async settlementFor(
    orderId: string,
    user: AuthenticatedUser,
  ): Promise<Settlement> {
    await this.orders.requireVisibleOrder(orderId, user);

    return (await loadSettlement(this.prisma, orderId))!;
  }

  /** The money arrived. One-way: a cleared payment is never un-cleared. */
  async markPaid(
    id: string,
    dto: MarkPaidDto,
    user: AuthenticatedUser,
  ): Promise<Payment> {
    const existing = await this.requirePayment(id);
    const paidAt = this.paidAtFrom(dto.paidAt) ?? new Date();

    return this.prisma.$transaction(async (tx) => {
      await lockOrder(tx, existing.orderId);

      // Compare-and-swap on paid_at: two clerks recording the same transfer
      // produce one PAID row and one 409, not two history rows.
      const { count } = await tx.payment.updateMany({
        where: { id, paidAt: null },
        data: {
          paidAt,
          ...(dto.reference === undefined ? {} : { reference: dto.reference }),
        },
      });

      if (count === 0) {
        throw new ConflictException(`Payment ${id} is already marked paid`);
      }

      const payment = await tx.payment.findUniqueOrThrow({ where: { id } });

      await this.statusHistory.record(tx, {
        entityType: EntityType.PAYMENT,
        entityId: id,
        fromStatus: PAYMENT_OUTSTANDING,
        toStatus: PAYMENT_PAID,
        changedBy: user.id,
        reason: `${payment.paymentType} ${payment.amount.toFixed(2)} ${payment.currency} received`,
      });

      await this.afterClearing(tx, payment, user);

      return payment;
    });
  }

  /**
   * Voids an invoice raised in error. Money that has cleared stays on the
   * ledger — the correction for that is a REFUND, which is itself a row.
   */
  async remove(id: string, user: AuthenticatedUser): Promise<void> {
    const payment = await this.requirePayment(id);

    if (payment.paidAt) {
      throw new UnprocessableEntityException(
        `Payment ${id} has cleared and cannot be deleted. Record a REFUND instead`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.payment.deleteMany({
        where: { id, paidAt: null },
      });

      if (count === 0) {
        throw new ConflictException(
          `Payment ${id} was marked paid while this request was in flight`,
        );
      }

      await this.statusHistory.record(tx, {
        entityType: EntityType.PAYMENT,
        entityId: id,
        fromStatus: PAYMENT_OUTSTANDING,
        toStatus: PAYMENT_VOIDED,
        changedBy: user.id,
        reason: `${payment.paymentType} invoice voided`,
      });
    });
  }

  /**
   * Runs under the order lock, in the payment's transaction. If this payment
   * made the order whole: release the documents, and if the order was stuck
   * waiting on exactly this, close it out.
   */
  private async afterClearing(
    tx: Prisma.TransactionClient,
    payment: Payment,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (!CLIENT_PAYMENT_TYPES.includes(payment.paymentType)) {
      return;
    }

    const settlement = await loadSettlement(tx, payment.orderId);

    if (!settlement?.paidInFull) {
      return;
    }

    await this.documents.releaseForOrder(
      tx,
      payment.orderId,
      user,
      'Balance payment cleared',
    );

    const order = await tx.order.findUniqueOrThrow({
      where: { id: payment.orderId },
      select: { id: true, status: true },
    });

    if (order.status === OrderStatus.DOCUMENTS_WITHHELD) {
      await this.orders.applyTransition(
        tx,
        order,
        OrderStatus.CLOSED_OUT,
        user,
        'Final payment cleared — documents released',
      );
    }
  }

  /** Fills in or checks direction and counterparty against the order. */
  private async counterpartyFor(
    dto: CreatePaymentDto,
    order: Order,
  ): Promise<Counterparty> {
    const clientDirection = CLIENT_DIRECTION[dto.paymentType];

    if (clientDirection) {
      const direction = dto.direction ?? clientDirection;
      const counterpartyType = dto.counterpartyType ?? CounterpartyType.CLIENT;
      const counterpartyId = dto.counterpartyId ?? order.clientId;

      if (
        direction !== clientDirection ||
        counterpartyType !== CounterpartyType.CLIENT ||
        counterpartyId !== order.clientId
      ) {
        throw new UnprocessableEntityException(
          `A ${dto.paymentType} is ${clientDirection} and its counterparty is the order's client (${order.clientId})`,
        );
      }

      return { direction, counterpartyType, counterpartyId };
    }

    if (!dto.direction || !dto.counterpartyType || !dto.counterpartyId) {
      throw new BadRequestException(
        `A ${dto.paymentType} payment needs direction, counterpartyType and counterpartyId`,
      );
    }

    if (
      dto.counterpartyType === CounterpartyType.CLIENT &&
      dto.counterpartyId !== order.clientId
    ) {
      throw new UnprocessableEntityException(
        "A client counterparty on this order must be the order's own client",
      );
    }

    await this.assertCounterpartyExists(
      dto.counterpartyType,
      dto.counterpartyId,
    );

    return {
      direction: dto.direction,
      counterpartyType: dto.counterpartyType,
      counterpartyId: dto.counterpartyId,
    };
  }

  /**
   * counterparty_id is polymorphic, so no foreign key guards it. This does.
   */
  private async assertCounterpartyExists(
    type: CounterpartyType,
    id: string,
  ): Promise<void> {
    const where = { where: { id }, select: { id: true } } as const;

    const found = await {
      [CounterpartyType.CLIENT]: () => this.prisma.client.findUnique(where),
      [CounterpartyType.SUPPLIER]: () => this.prisma.supplier.findUnique(where),
      [CounterpartyType.FREIGHT_PROVIDER]: () =>
        this.prisma.freightProvider.findUnique(where),
      [CounterpartyType.CUSTOMS_AGENT]: () =>
        this.prisma.customsAgent.findUnique(where),
      [CounterpartyType.WAREHOUSE]: () =>
        this.prisma.warehouse.findUnique(where),
    }[type]();

    if (!found) {
      throw new BadRequestException(`${type} ${id} does not exist`);
    }
  }

  private paidAtFrom(value: string | undefined): Date | null {
    if (!value) {
      return null;
    }

    const paidAt = new Date(value);

    if (paidAt > new Date()) {
      throw new BadRequestException('A payment cannot be paid in the future');
    }

    return paidAt;
  }

  /**
   * A client sees money between them and the office, on their own orders.
   * What the office paid the factory or the forwarder is its margin, and
   * stays out of the portal.
   */
  private scope(user: AuthenticatedUser): Prisma.PaymentWhereInput {
    if (!isClient(user)) {
      return {};
    }

    return {
      order: { clientId: requireClientId(user) },
      counterpartyType: CounterpartyType.CLIENT,
    };
  }

  private async requirePayment(id: string): Promise<Payment> {
    const payment = await this.prisma.payment.findUnique({ where: { id } });

    if (!payment) {
      throw new NotFoundException(`Payment ${id} not found`);
    }

    return payment;
  }
}
