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

/**
 * Walks orders along the Phase 2 lifecycle over HTTP, so later gates can
 * start from "an order ready to ship" without restating how it got there.
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
      .send({ clientId, agreedPrice: 10000, currency: 'USD', items })
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

  /** ORDER_PLACED → SHIPMENT_BOOKING, with production and a signed QC. */
  async toShipmentBooking(orderId: string): Promise<void> {
    await this.move(orderId, OrderStatus.ORDER_CONFIRMED);

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

  /** SHIPMENT_BOOKING → CLOSED_OUT. */
  async toClosedOut(orderId: string): Promise<void> {
    for (const status of [
      OrderStatus.ROUTE_DECISION,
      OrderStatus.IN_TRANSIT,
      OrderStatus.DELIVERED,
      OrderStatus.CLOSED_OUT,
    ]) {
      await this.move(orderId, status);
    }
  }
}
