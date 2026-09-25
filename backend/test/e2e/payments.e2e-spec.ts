import { INestApplication } from '@nestjs/common';
import { EntityType, OrderStatus } from '@prisma/client';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  OrderWalker,
  WALK_BALANCE,
  WALK_DEPOSIT,
} from '../fixtures/order-walk';
import {
  Actors,
  createActors,
  createTestApp,
  destroyActors,
  http,
  login,
} from '../fixtures/test-app';

/**
 * Gate 4 — the money half.
 *
 *   "Deposit recorded on confirmation. Balance payment triggers release."
 *
 * Plus the guards the order state diagram hangs on payments: the deposit
 * clears before GOODS_RECEIVED, the balance invoice waits for QC sign-off,
 * and the order does not close out owing money.
 */
describe('Gate 4 — payments and the payment gates', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let actors: Actors;
  let walker: OrderWalker;
  let managerToken: string;
  let clientAToken: string;
  let clientBToken: string;

  const asManager = () => ({ Authorization: `Bearer ${managerToken}` });
  const asA = () => ({ Authorization: `Bearer ${clientAToken}` });
  const asB = () => ({ Authorization: `Bearer ${clientBToken}` });

  const chairs = {
    description: 'Rattan dining chairs',
    quantity: 120,
    unitCbm: 0.085,
    unitWeightKg: 4.2,
    unitPrice: 150,
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    actors = await createActors(prisma);
    managerToken = await login(app, `manager-${actors.suffix}@cargotrack.test`);
    clientAToken = await login(app, `user-a-${actors.suffix}@cargotrack.test`);
    clientBToken = await login(app, `user-b-${actors.suffix}@cargotrack.test`);
    walker = new OrderWalker(app, managerToken, actors.supplierId);
  });

  afterAll(async () => {
    await destroyActors(prisma, actors);
    await app.close();
  });

  function pay(body: Record<string, unknown>) {
    return http(app).post('/api/payments').set(asManager()).send(body);
  }

  function moveTo(orderId: string, status: OrderStatus) {
    return http(app)
      .post(`/api/orders/${orderId}/status`)
      .set(asManager())
      .send({ status });
  }

  /** Confirmed without a deposit, production received, QC signed. */
  async function confirmedWithGoodsWaiting(): Promise<string> {
    const orderId = await walker.place(actors.clientAId, [chairs]);
    await moveTo(orderId, OrderStatus.ORDER_CONFIRMED).expect(200);

    const batch = await http(app)
      .post('/api/production-orders')
      .set(asManager())
      .send({
        orderId,
        supplierId: actors.supplierId,
        agreedCost: 4000,
        currency: 'CNY',
      })
      .expect(201);
    const batchId = (batch.body as { id: string }).id;

    for (const status of ['IN_PRODUCTION', 'READY', 'RECEIVED']) {
      await http(app)
        .post(`/api/production-orders/${batchId}/status`)
        .set(asManager())
        .send({ status })
        .expect(200);
    }

    return orderId;
  }

  describe('deposit recorded on confirmation', () => {
    it('writes the deposit and the confirmation in one call', async () => {
      const orderId = await walker.place(actors.clientAId, [chairs]);

      await walker.confirm(orderId);

      const payments = await prisma.payment.findMany({ where: { orderId } });

      expect(payments).toHaveLength(1);
      expect(payments[0]).toMatchObject({
        paymentType: 'DEPOSIT',
        direction: 'INBOUND',
        counterpartyType: 'CLIENT',
        counterpartyId: actors.clientAId,
        currency: 'USD',
      });
      expect(payments[0].amount.toNumber()).toBe(WALK_DEPOSIT);
      expect(payments[0].paidAt).not.toBeNull();

      const trail = await prisma.statusHistory.findFirst({
        where: { entityType: EntityType.PAYMENT, entityId: payments[0].id },
      });

      expect(trail).toMatchObject({
        fromStatus: null,
        toStatus: 'PAID',
        reason: 'Deposit recorded on order confirmation',
      });
    });

    it('refuses a deposit sent with any other transition', async () => {
      const orderId = await walker.place(actors.clientAId, [chairs]);

      await http(app)
        .post(`/api/orders/${orderId}/status`)
        .set(asManager())
        .send({ status: OrderStatus.CANCELLED, deposit: { amount: 2000 } })
        .expect(400);

      expect(await prisma.payment.count({ where: { orderId } })).toBe(0);
    });

    it('rolls the deposit back with the confirmation it came with', async () => {
      // No items: the confirmation fails its precondition, so no money
      // should be on the ledger for an order that never confirmed.
      const response = await http(app)
        .post('/api/orders')
        .set(asManager())
        .send({
          clientId: actors.clientAId,
          agreedPrice: 5000,
          currency: 'USD',
        })
        .expect(201);
      const orderId = (response.body as { id: string }).id;

      await http(app)
        .post(`/api/orders/${orderId}/status`)
        .set(asManager())
        .send({
          status: OrderStatus.ORDER_CONFIRMED,
          deposit: { amount: 1000 },
        })
        .expect(422);

      expect(await prisma.payment.count({ where: { orderId } })).toBe(0);
    });
  });

  describe('the deposit gate before GOODS_RECEIVED', () => {
    let orderId: string;

    beforeAll(async () => {
      orderId = await confirmedWithGoodsWaiting();
    });

    it('refuses goods in with no deposit, naming the guard', async () => {
      const response = await moveTo(orderId, OrderStatus.GOODS_RECEIVED).expect(
        422,
      );

      expect(response.body).toMatchObject({
        error: 'guard_failed',
        guard: 'deposit',
      });
      expect((response.body as { message: string }).message).toContain(
        '2000.00 USD required, 0.00 received',
      );
    });

    it('does not count a deposit invoiced but not yet paid', async () => {
      await pay({
        orderId,
        paymentType: 'DEPOSIT',
        amount: WALK_DEPOSIT,
        currency: 'USD',
      }).expect(201);

      await moveTo(orderId, OrderStatus.GOODS_RECEIVED).expect(422);
    });

    it('refuses a deposit one cent short', async () => {
      await pay({
        orderId,
        paymentType: 'DEPOSIT',
        amount: 1999.99,
        currency: 'USD',
        paidAt: new Date().toISOString(),
      }).expect(201);

      await moveTo(orderId, OrderStatus.GOODS_RECEIVED).expect(422);
    });

    it('opens at exactly the required deposit', async () => {
      await pay({
        orderId,
        paymentType: 'DEPOSIT',
        amount: 0.01,
        currency: 'USD',
        paidAt: new Date().toISOString(),
      }).expect(201);

      await moveTo(orderId, OrderStatus.GOODS_RECEIVED).expect(200);
    });
  });

  describe('the balance invoice and QC sign-off', () => {
    it('refuses to raise a balance invoice before the client signs QC', async () => {
      const orderId = await confirmedWithGoodsWaiting();

      const response = await pay({
        orderId,
        paymentType: 'BALANCE',
        amount: WALK_BALANCE,
        currency: 'USD',
      }).expect(422);

      expect(response.body).toMatchObject({ guard: 'qc_signoff' });
    });
  });

  describe('the balance gate before CLOSED_OUT', () => {
    let orderId: string;

    beforeAll(async () => {
      orderId = await walker.place(actors.clientAId, [chairs]);
      await walker.toShipmentBooking(orderId);
      await walker.toDelivered(orderId);
    });

    it('refuses to close out while anything is owed', async () => {
      await walker.payBalance(orderId, WALK_BALANCE - 0.01);

      const response = await moveTo(orderId, OrderStatus.CLOSED_OUT).expect(
        422,
      );

      expect(response.body).toMatchObject({ guard: 'balance' });
      expect((response.body as { message: string }).message).toContain(
        '0.01 USD outstanding',
      );
    });

    it('reports the settlement to the client who owes it', async () => {
      const response = await http(app)
        .get(`/api/orders/${orderId}/settlement`)
        .set(asA())
        .expect(200);

      expect(response.body).toMatchObject({
        currency: 'USD',
        depositMet: true,
        paidInFull: false,
      });
      expect(Number((response.body as { balanceDue: string }).balanceDue)).toBe(
        0.01,
      );

      await http(app)
        .get(`/api/orders/${orderId}/settlement`)
        .set(asB())
        .expect(404);
    });

    it('closes out once the last cent lands', async () => {
      await walker.payBalance(orderId, 0.01);
      await moveTo(orderId, OrderStatus.CLOSED_OUT).expect(200);
    });

    it('refuses DOCUMENTS_WITHHELD on an order that owes nothing', async () => {
      const paidUp = await walker.place(actors.clientAId, [chairs]);
      await walker.toShipmentBooking(paidUp);
      await walker.toDelivered(paidUp);
      await walker.payBalance(paidUp);

      await moveTo(paidUp, OrderStatus.DOCUMENTS_WITHHELD).expect(422);
    });
  });

  describe('ledger rules', () => {
    let orderId: string;

    beforeAll(async () => {
      orderId = await walker.place(actors.clientAId, [chairs]);
      await walker.confirm(orderId);
    });

    it('refuses client money in a currency other than the order currency', async () => {
      await pay({
        orderId,
        paymentType: 'DEPOSIT',
        amount: 500,
        currency: 'EUR',
      }).expect(422);
    });

    it('refuses a deposit pointed at the wrong direction or client', async () => {
      await pay({
        orderId,
        paymentType: 'DEPOSIT',
        direction: 'OUTBOUND',
        amount: 500,
        currency: 'USD',
      }).expect(422);

      await pay({
        orderId,
        paymentType: 'DEPOSIT',
        counterpartyType: 'CLIENT',
        counterpartyId: actors.clientBId,
        amount: 500,
        currency: 'USD',
      }).expect(422);
    });

    it('needs an explicit, existing counterparty for supplier money', async () => {
      await pay({
        orderId,
        paymentType: 'FREIGHT',
        amount: 1200,
        currency: 'USD',
      }).expect(400);

      await pay({
        orderId,
        paymentType: 'FREIGHT',
        direction: 'OUTBOUND',
        counterpartyType: 'SUPPLIER',
        counterpartyId: actors.clientAId,
        amount: 1200,
        currency: 'USD',
      }).expect(400);

      await pay({
        orderId,
        paymentType: 'FREIGHT',
        direction: 'OUTBOUND',
        counterpartyType: 'SUPPLIER',
        counterpartyId: actors.supplierId,
        amount: 8400,
        currency: 'CNY',
        fxRate: 0.1389,
        paidAt: new Date().toISOString(),
      }).expect(201);
    });

    it('refuses money paid in the future', async () => {
      await pay({
        orderId,
        paymentType: 'DEPOSIT',
        amount: 10,
        currency: 'USD',
        paidAt: new Date(Date.now() + 86_400_000).toISOString(),
      }).expect(400);
    });

    it('shows a client their own money and nothing the office paid out', async () => {
      const response = await http(app)
        .get(`/api/payments?orderId=${orderId}`)
        .set(asA())
        .expect(200);

      const { data } = response.body as { data: { paymentType: string }[] };

      expect(data.map((payment) => payment.paymentType)).toEqual(['DEPOSIT']);

      const office = await http(app)
        .get(`/api/payments?orderId=${orderId}`)
        .set(asManager())
        .expect(200);

      expect(
        (office.body as { data: { paymentType: string }[] }).data.map(
          (payment) => payment.paymentType,
        ),
      ).toContain('FREIGHT');

      const otherClient = await http(app)
        .get(`/api/payments?orderId=${orderId}`)
        .set(asB())
        .expect(200);

      expect((otherClient.body as { data: unknown[] }).data).toHaveLength(0);
    });

    it('marks an invoice paid once, and only once', async () => {
      const invoice = await pay({
        orderId,
        paymentType: 'STORAGE',
        direction: 'OUTBOUND',
        counterpartyType: 'SUPPLIER',
        counterpartyId: actors.supplierId,
        amount: 90,
        currency: 'USD',
      }).expect(201);
      const id = (invoice.body as { id: string }).id;

      const results = await Promise.all([
        http(app).post(`/api/payments/${id}/paid`).set(asManager()).send({}),
        http(app).post(`/api/payments/${id}/paid`).set(asManager()).send({}),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual([200, 409]);

      const paid = await prisma.statusHistory.count({
        where: { entityId: id, toStatus: 'PAID' },
      });

      expect(paid).toBe(1);
    });

    it('voids an unpaid invoice but never deletes cleared money', async () => {
      const invoice = await pay({
        orderId,
        paymentType: 'DEPOSIT',
        amount: 1,
        currency: 'USD',
      }).expect(201);
      const id = (invoice.body as { id: string }).id;

      await http(app)
        .delete(`/api/payments/${id}`)
        .set(asManager())
        .expect(204);

      const voided = await prisma.statusHistory.findFirst({
        where: { entityId: id, toStatus: 'VOIDED' },
      });

      expect(voided).not.toBeNull();

      const deposit = await prisma.payment.findFirstOrThrow({
        where: { orderId, paymentType: 'DEPOSIT', paidAt: { not: null } },
      });

      await http(app)
        .delete(`/api/payments/${deposit.id}`)
        .set(asManager())
        .expect(422);
    });

    it('keeps clients out of the ledger write paths', async () => {
      await http(app)
        .post('/api/payments')
        .set(asA())
        .send({ orderId, paymentType: 'BALANCE', amount: 1, currency: 'USD' })
        .expect(403);
    });
  });
});
