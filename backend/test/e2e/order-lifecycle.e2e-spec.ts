import { INestApplication } from '@nestjs/common';
import { OrderStatus, ProductionOrderStatus, QcOutcome } from '@prisma/client';

import { PrismaService } from '../../src/prisma/prisma.service';
import { ORDER_HAPPY_PATH } from '../../src/common/state-machines/order.state-machine';
import {
  Actors,
  createActors,
  createTestApp,
  destroyActors,
  http,
  login,
} from '../fixtures/test-app';

/**
 * Gate 2, executed rather than asserted about.
 *
 *   "A full order can be walked from Order Placed to Closed Out via API calls
 *    alone. All 8 states transition correctly. An invalid transition is
 *    rejected with a clear error. STATUS_HISTORY is populated at every step."
 *
 * Every line below goes over HTTP. Nothing reaches into the database to move
 * an order along, because a gate that can be met by writing to Postgres
 * directly has not been met.
 */
describe('Gate 2 — the order lifecycle over the API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let actors: Actors;
  let managerToken: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    actors = await createActors(prisma);
    managerToken = await login(app, `manager-${actors.suffix}@cargotrack.test`);
  });

  afterAll(async () => {
    await destroyActors(prisma, actors);
    await app.close();
  });

  const asManager = () => ({ Authorization: `Bearer ${managerToken}` });

  async function placeOrder(withItems = true): Promise<string> {
    const response = await http(app)
      .post('/api/orders')
      .set(asManager())
      .send({
        clientId: actors.clientAId,
        agreedPrice: 24000,
        currency: 'usd',
        depositPercentage: 20,
        items: withItems
          ? [
              {
                description: 'Rattan dining chairs',
                category: 'Furniture',
                quantity: 120,
                unitCbm: 0.085,
                unitWeightKg: 4.2,
                unitPrice: 150,
              },
            ]
          : undefined,
      })
      .expect(201);

    return (response.body as { id: string }).id;
  }

  /**
   * Returns the supertest request rather than awaiting it, so each call site
   * can assert its own status code inline.
   */
  function moveTo(orderId: string, status: OrderStatus, reason?: string) {
    return http(app)
      .post(`/api/orders/${orderId}/status`)
      .set(asManager())
      .send({ status, ...(reason ? { reason } : {}) });
  }

  /** Production placed, received, inspected, and signed off by the client. */
  async function clearQualityControl(orderId: string): Promise<void> {
    const batch = await http(app)
      .post('/api/production-orders')
      .set(asManager())
      .send({
        orderId,
        supplierId: actors.supplierId,
        agreedCost: 9000,
        currency: 'CNY',
      })
      .expect(201);

    const batchId = (batch.body as { id: string }).id;

    for (const status of [
      ProductionOrderStatus.IN_PRODUCTION,
      ProductionOrderStatus.READY,
      ProductionOrderStatus.RECEIVED,
    ]) {
      await http(app)
        .post(`/api/production-orders/${batchId}/status`)
        .set(asManager())
        .send({ status })
        .expect(200);
    }

    const inspection = await http(app)
      .post('/api/qc-inspections')
      .set(asManager())
      .send({
        productionOrderId: batchId,
        inspectedAt: new Date().toISOString(),
        outcome: QcOutcome.PASSED,
      })
      .expect(201);

    await http(app)
      .patch(
        `/api/qc-inspections/${(inspection.body as { id: string }).id}/sign-off`,
      )
      .set(asManager())
      .send({})
      .expect(200);
  }

  describe('the happy path', () => {
    let orderId: string;

    it('places an order and derives its volume and weight from the items', async () => {
      orderId = await placeOrder();

      const order = await http(app)
        .get(`/api/orders/${orderId}`)
        .set(asManager())
        .expect(200);

      const body = order.body as {
        status: OrderStatus;
        currency: string;
        totalCbm: string;
        totalWeightKg: string;
      };

      expect(body.status).toBe(OrderStatus.ORDER_PLACED);
      // 120 x 0.085 CBM, 120 x 4.2 kg — computed, never submitted.
      expect(Number(body.totalCbm)).toBeCloseTo(10.2, 3);
      expect(Number(body.totalWeightKg)).toBeCloseTo(504, 3);
      expect(body.currency).toBe('USD');
    });

    it('walks all 8 states to CLOSED_OUT', async () => {
      await moveTo(orderId, OrderStatus.ORDER_CONFIRMED).expect(200);

      await clearQualityControl(orderId);

      for (const status of [
        OrderStatus.GOODS_RECEIVED,
        OrderStatus.SHIPMENT_BOOKING,
        OrderStatus.ROUTE_DECISION,
        OrderStatus.IN_TRANSIT,
        OrderStatus.DELIVERED,
        OrderStatus.CLOSED_OUT,
      ]) {
        const response = await moveTo(orderId, status);

        expect([status, response.status]).toEqual([status, 200]);
        expect((response.body as { status: OrderStatus }).status).toBe(status);
      }

      const closed = await http(app)
        .get(`/api/orders/${orderId}`)
        .set(asManager())
        .expect(200);

      const body = closed.body as { status: OrderStatus; closedAt: string };

      expect(body.status).toBe(OrderStatus.CLOSED_OUT);
      expect(body.closedAt).not.toBeNull();
    });

    it('left a status history row for every step', async () => {
      const response = await http(app)
        .get(`/api/orders/${orderId}/status-history`)
        .set(asManager())
        .expect(200);

      const history = response.body as {
        fromStatus: string | null;
        toStatus: string;
        changedBy: string;
      }[];

      // One row for the placement, then one per transition.
      expect(history).toHaveLength(ORDER_HAPPY_PATH.length);
      expect(history[0].fromStatus).toBeNull();
      expect(history[0].toStatus).toBe(OrderStatus.ORDER_PLACED);

      // The chain has no holes: every row starts where the previous ended.
      history.slice(1).forEach((row, index) => {
        expect(row.fromStatus).toBe(history[index].toStatus);
      });

      expect(history.map((row) => row.toStatus)).toEqual([...ORDER_HAPPY_PATH]);
      expect(history.every((row) => row.changedBy === actors.managerId)).toBe(
        true,
      );
    });
  });

  describe('invalid transitions', () => {
    let orderId: string;

    beforeAll(async () => {
      orderId = await placeOrder();
    });

    it('rejects a skipped state with 422 and names the legal targets', async () => {
      const response = await moveTo(orderId, OrderStatus.IN_TRANSIT).expect(
        422,
      );

      expect((response.body as { message: string }).message).toContain(
        'Valid transitions from ORDER_PLACED',
      );
    });

    it('rejects a status that is not a status at all with 400', async () => {
      await http(app)
        .post(`/api/orders/${orderId}/status`)
        .set(asManager())
        .send({ status: 'ALMOST_THERE' })
        .expect(400);
    });

    it('refuses to advance an order that has no items', async () => {
      const emptyOrderId = await placeOrder(false);

      const response = await moveTo(
        emptyOrderId,
        OrderStatus.ORDER_CONFIRMED,
      ).expect(422);

      expect((response.body as { message: string }).message).toContain(
        'at least one item',
      );
    });

    it('refuses to book a shipment before QC is signed off', async () => {
      const other = await placeOrder();

      await moveTo(other, OrderStatus.ORDER_CONFIRMED).expect(200);

      // Production received, but nobody signed the QC sheet.
      const batch = await http(app)
        .post('/api/production-orders')
        .set(asManager())
        .send({
          orderId: other,
          supplierId: actors.supplierId,
          agreedCost: 5000,
          currency: 'CNY',
        })
        .expect(201);

      const batchId = (batch.body as { id: string }).id;

      for (const status of [
        ProductionOrderStatus.IN_PRODUCTION,
        ProductionOrderStatus.READY,
        ProductionOrderStatus.RECEIVED,
      ]) {
        await http(app)
          .post(`/api/production-orders/${batchId}/status`)
          .set(asManager())
          .send({ status })
          .expect(200);
      }

      await moveTo(other, OrderStatus.GOODS_RECEIVED).expect(200);

      const response = await moveTo(other, OrderStatus.SHIPMENT_BOOKING).expect(
        422,
      );

      expect((response.body as { message: string }).message).toContain(
        'signed off by the client',
      );
    });

    it('writes no history row for a rejected transition', async () => {
      const before = await prisma.statusHistory.count({
        where: { entityId: orderId },
      });

      await moveTo(orderId, OrderStatus.CLOSED_OUT).expect(422);

      const after = await prisma.statusHistory.count({
        where: { entityId: orderId },
      });

      expect(after).toBe(before);
    });

    it('does not accept status as an ordinary PATCH field', async () => {
      // whitelist + forbidNonWhitelisted: the only door is POST /status.
      await http(app)
        .patch(`/api/orders/${orderId}`)
        .set(asManager())
        .send({ status: OrderStatus.CLOSED_OUT })
        .expect(400);

      const order = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });

      expect(order.status).toBe(OrderStatus.ORDER_PLACED);
    });
  });

  describe('exception branches', () => {
    it('cancels an order and then refuses to revive it', async () => {
      const orderId = await placeOrder();

      await moveTo(
        orderId,
        OrderStatus.CANCELLED,
        'Client withdrew before confirmation',
      ).expect(200);

      await moveTo(orderId, OrderStatus.ORDER_CONFIRMED).expect(422);
    });

    it('records the reason on the withheld-documents branch', async () => {
      const orderId = await placeOrder();

      await moveTo(orderId, OrderStatus.ORDER_CONFIRMED).expect(200);
      await clearQualityControl(orderId);

      for (const status of [
        OrderStatus.GOODS_RECEIVED,
        OrderStatus.SHIPMENT_BOOKING,
        OrderStatus.ROUTE_DECISION,
        OrderStatus.IN_TRANSIT,
        OrderStatus.DELIVERED,
      ]) {
        await moveTo(orderId, status).expect(200);
      }

      await moveTo(
        orderId,
        OrderStatus.DOCUMENTS_WITHHELD,
        'Balance payment not received within terms.',
      ).expect(200);

      const history = await prisma.statusHistory.findMany({
        where: { entityId: orderId, toStatus: OrderStatus.DOCUMENTS_WITHHELD },
      });

      expect(history[0].reason).toBe(
        'Balance payment not received within terms.',
      );

      // And it rejoins the happy path once the money arrives.
      await moveTo(orderId, OrderStatus.CLOSED_OUT).expect(200);
    });
  });

  describe('order items and derived totals', () => {
    let orderId: string;

    const readTotals = async () => {
      const response = await http(app)
        .get(`/api/orders/${orderId}`)
        .set(asManager())
        .expect(200);

      const body = response.body as {
        totalCbm: string;
        totalWeightKg: string;
      };

      return {
        cbm: Number(body.totalCbm),
        weight: Number(body.totalWeightKg),
      };
    };

    beforeAll(async () => {
      orderId = await placeOrder();
    });

    it('rolls a new line into the order totals', async () => {
      const before = await readTotals();

      await http(app)
        .post(`/api/orders/${orderId}/items`)
        .set(asManager())
        .send({
          description: 'Woven side tables',
          quantity: 50,
          unitCbm: 0.2,
          unitWeightKg: 8,
          unitPrice: 90,
        })
        .expect(201);

      const after = await readTotals();

      expect(after.cbm).toBeCloseTo(before.cbm + 10, 3);
      expect(after.weight).toBeCloseTo(before.weight + 400, 3);
    });

    it('rolls an edited quantity through as well', async () => {
      const items = await http(app)
        .get(`/api/orders/${orderId}/items`)
        .set(asManager())
        .expect(200);

      const tables = (items.body as { id: string; description: string }[]).find(
        (item) => item.description === 'Woven side tables',
      );

      await http(app)
        .patch(`/api/orders/${orderId}/items/${tables?.id}`)
        .set(asManager())
        .send({ quantity: 25 })
        .expect(200);

      const after = await readTotals();

      // 120 x 0.085 from the original line, plus 25 x 0.2 from this one.
      expect(after.cbm).toBeCloseTo(15.2, 3);
      expect(after.weight).toBeCloseTo(704, 3);
    });

    it('rolls a deleted line back out', async () => {
      const items = await http(app)
        .get(`/api/orders/${orderId}/items`)
        .set(asManager())
        .expect(200);

      const tables = (items.body as { id: string; description: string }[]).find(
        (item) => item.description === 'Woven side tables',
      );

      await http(app)
        .delete(`/api/orders/${orderId}/items/${tables?.id}`)
        .set(asManager())
        .expect(204);

      const after = await readTotals();

      expect(after.cbm).toBeCloseTo(10.2, 3);
      expect(after.weight).toBeCloseTo(504, 3);
    });

    it('refuses to edit the manifest once the goods exist', async () => {
      await moveTo(orderId, OrderStatus.ORDER_CONFIRMED).expect(200);
      await clearQualityControl(orderId);
      await moveTo(orderId, OrderStatus.GOODS_RECEIVED).expect(200);

      await http(app)
        .post(`/api/orders/${orderId}/items`)
        .set(asManager())
        .send({
          description: 'Late addition',
          quantity: 1,
          unitCbm: 1,
          unitWeightKg: 1,
          unitPrice: 1,
        })
        .expect(422);
    });

    it('holds the deposit to roughly a fifth', async () => {
      for (const depositPercentage of [5, 60]) {
        await http(app)
          .post('/api/orders')
          .set(asManager())
          .send({
            clientId: actors.clientAId,
            agreedPrice: 1000,
            currency: 'USD',
            depositPercentage,
          })
          .expect(400);
      }

      await http(app)
        .post('/api/orders')
        .set(asManager())
        .send({
          clientId: actors.clientAId,
          agreedPrice: 1000,
          currency: 'USD',
          depositPercentage: 22.5,
        })
        .expect(201);
    });

    it('rejects a currency that is not an ISO code', async () => {
      await http(app)
        .post('/api/orders')
        .set(asManager())
        .send({
          clientId: actors.clientAId,
          agreedPrice: 1000,
          currency: 'dollars',
        })
        .expect(400);
    });
  });
});
