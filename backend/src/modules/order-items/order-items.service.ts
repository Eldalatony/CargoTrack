import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Order, OrderItem, OrderStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { OrdersService } from '../orders/orders.service';
import { OrderItemInputDto } from './dto/order-item-input.dto';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';

/**
 * Lines can be edited while the order is still being agreed, and while it is
 * back with the office after a factory falls through. Once the goods exist,
 * the manifest is what was actually made — editing it then would silently
 * rewrite the CBM a container was booked against.
 */
const EDITABLE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.ORDER_PLACED,
  OrderStatus.ORDER_CONFIRMED,
  OrderStatus.FACTORY_CANNOT_FULFIL,
];

@Injectable()
export class OrderItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  async create(
    orderId: string,
    dto: OrderItemInputDto,
    user: AuthenticatedUser,
  ): Promise<OrderItem> {
    await this.requireEditableOrder(orderId, user);

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.orderItem.create({
        data: {
          orderId,
          description: dto.description,
          category: dto.category ?? null,
          quantity: dto.quantity,
          unitCbm: new Prisma.Decimal(dto.unitCbm),
          unitWeightKg: new Prisma.Decimal(dto.unitWeightKg),
          unitPrice: new Prisma.Decimal(dto.unitPrice),
        },
      });

      await this.orders.refreshTotals(tx, orderId);

      return item;
    });
  }

  async findAll(
    orderId: string,
    user: AuthenticatedUser,
  ): Promise<OrderItem[]> {
    await this.orders.requireVisibleOrder(orderId, user);

    return this.prisma.orderItem.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(
    orderId: string,
    id: string,
    dto: UpdateOrderItemDto,
    user: AuthenticatedUser,
  ): Promise<OrderItem> {
    await this.requireEditableOrder(orderId, user);
    await this.requireItem(orderId, id);

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.orderItem.update({
        where: { id },
        data: {
          ...(dto.description === undefined
            ? {}
            : { description: dto.description }),
          ...(dto.category === undefined ? {} : { category: dto.category }),
          ...(dto.quantity === undefined ? {} : { quantity: dto.quantity }),
          ...(dto.unitCbm === undefined
            ? {}
            : { unitCbm: new Prisma.Decimal(dto.unitCbm) }),
          ...(dto.unitWeightKg === undefined
            ? {}
            : { unitWeightKg: new Prisma.Decimal(dto.unitWeightKg) }),
          ...(dto.unitPrice === undefined
            ? {}
            : { unitPrice: new Prisma.Decimal(dto.unitPrice) }),
        },
      });

      await this.orders.refreshTotals(tx, orderId);

      return item;
    });
  }

  async remove(
    orderId: string,
    id: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    await this.requireEditableOrder(orderId, user);
    await this.requireItem(orderId, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.orderItem.delete({ where: { id } });

      await this.orders.refreshTotals(tx, orderId);
    });
  }

  private async requireEditableOrder(
    orderId: string,
    user: AuthenticatedUser,
  ): Promise<Order> {
    const order = await this.orders.requireVisibleOrder(orderId, user);

    if (!EDITABLE_STATUSES.includes(order.status)) {
      throw new UnprocessableEntityException(
        `Order ${orderId} is ${order.status}; its items can no longer be changed`,
      );
    }

    return order;
  }

  /** Scoping the lookup by orderId keeps ids from other orders unreachable. */
  private async requireItem(orderId: string, id: string): Promise<OrderItem> {
    const item = await this.prisma.orderItem.findFirst({
      where: { id, orderId },
    });

    if (!item) {
      throw new NotFoundException(`Order item ${id} not found on this order`);
    }

    return item;
  }
}
