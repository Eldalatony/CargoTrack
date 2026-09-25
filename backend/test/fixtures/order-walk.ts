import { INestApplication } from '@nestjs/common';
import { OrderStatus, ProductionOrderStatus, QcOutcome } from '@prisma/client';

import { http } from './test-app';

export interface OrderLine {
  description: string;
  quantity: number;
  unitCbm: number;
  unitWeightKg: number;
  unitPrice: number;
}

/** Every order the walker places: 10,000 USD at the default 20% deposit. */
export const WALK_PRICE = 10_000;
export const WALK_DEPOSIT = 2_000;
export const WALK_BALANCE = WALK_PRICE - WALK_DEPOSIT;

/**
 * Walks orders along the lifecycle over HTTP, so later gates can start from
 * "an order ready to ship" without restating how it got there — including the
 * money: the deposit is taken on confirmation, and the balance is paid before
 * close-out, because since Phase 4 the order cannot move without them.
 */
export class OrderWalker {
  constructor(
    private readonly app: INestApplication,
    private readonly token: string,
    private readonly supplierId: string,
  ) {}

  private auth() {
    return { Authorization: `Bearer ${this.token}` };
  }

  async place(clientId: string, items: OrderLine[]): Promise<string> {
    const response = await http(this.app)
      .post('/api/orders')
      .set(this.auth())
      .send({ clientId, agreedPrice: WALK_PRICE, currency: 'USD', items })
      .expect(201);

    return (response.body as { id: string }).id;
  }

  async move(orderId: string, status: OrderStatus): Promise<void> {
    await http(this.app)
      .post(`/api/orders/${orderId}/status`)
      .set(this.auth())
      .send({ status })
      .expect(200);
  }

  /** ORDER_PLACED → ORDER_CONFIRMED, recording the deposit in the same call. */
  async confirm(orderId: string): Promise<void> {
    await http(this.app)
      .post(`/api/orders/${orderId}/status`)
      .set(this.auth())
      .send({
        status: OrderStatus.ORDER_CONFIRMED,
        deposit: { amount: WALK_DEPOSIT },
      })
      .expect(200);
  }

  /** Raises the balance invoice and marks it paid. Returns the payment id. */
  async payBalance(orderId: string, amount = WALK_BALANCE): Promise<string> {
    const invoice = await http(this.app)
      .post('/api/payments')
      .set(this.auth())
      .send({ orderId, paymentType: 'BALANCE', amount, currency: 'USD' })
      .expect(201);

    const paymentId = (invoice.body as { id: string }).id;

    await http(this.app)
      .post(`/api/payments/${paymentId}/paid`)
      .set(this.auth())
      .send({})
      .expect(200);

    return paymentId;
  }

  /** ORDER_PLACED → SHIPMENT_BOOKING, with production and a signed QC. */
  async toShipmentBooking(orderId: string): Promise<void> {
    await this.confirm(orderId);

    const batch = await http(this.app)
      .post('/api/production-orders')
      .set(this.auth())
      .send({
        orderId,
        supplierId: this.supplierId,
        agreedCost: 4000,
        currency: 'CNY',
      })
      .expect(201);

    const batchId = (batch.body as { id: string }).id;

    for (const status of [
      ProductionOrderStatus.IN_PRODUCTION,
      ProductionOrderStatus.READY,
      ProductionOrderStatus.RECEIVED,
    ]) {
      await http(this.app)
        .post(`/api/production-orders/${batchId}/status`)
        .set(this.auth())
        .send({ status })
        .expect(200);
    }

    const inspection = await http(this.app)
      .post('/api/qc-inspections')
      .set(this.auth())
      .send({
        productionOrderId: batchId,
        inspectedAt: new Date().toISOString(),
        outcome: QcOutcome.PASSED,
      })
      .expect(201);

    await http(this.app)
      .patch(
        `/api/qc-inspections/${(inspection.body as { id: string }).id}/sign-off`,
      )
      .set(this.auth())
      .send({})
      .expect(200);

    await this.move(orderId, OrderStatus.GOODS_RECEIVED);
    await this.move(orderId, OrderStatus.SHIPMENT_BOOKING);
  }

  /** SHIPMENT_BOOKING → DELIVERED. */
  async toDelivered(orderId: string): Promise<void> {
    for (const status of [
      OrderStatus.ROUTE_DECISION,
      OrderStatus.IN_TRANSIT,
      OrderStatus.DELIVERED,
    ]) {
      await this.move(orderId, status);
    }
  }

  /** SHIPMENT_BOOKING → CLOSED_OUT, paying the balance on delivery. */
  async toClosedOut(orderId: string): Promise<void> {
    await this.toDelivered(orderId);
    await this.payBalance(orderId);
    await this.move(orderId, OrderStatus.CLOSED_OUT);
  }
}
