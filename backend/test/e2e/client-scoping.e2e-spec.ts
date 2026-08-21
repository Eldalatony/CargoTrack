import { INestApplication } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  Actors,
  createActors,
  createTestApp,
  destroyActors,
  http,
  login,
} from '../fixtures/test-app';

/**
 * The other half of Phase 2: "Middleware enforces data scoping — client A
 * cannot access client B data under any request."
 *
 * The tests below try the request paths a curious client actually has: a
 * direct id, a query parameter naming someone else, a nested route, and a
 * write. None of them may work, and none of them may answer in a way that
 * confirms the other client's rows exist.
 */
describe('Client data scoping', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let actors: Actors;

  let managerToken: string;
  let clientAToken: string;
  let clientBToken: string;

  let orderAId: string;
  let orderBId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    actors = await createActors(prisma);

    managerToken = await login(app, `manager-${actors.suffix}@cargotrack.test`);
    clientAToken = await login(app, `user-a-${actors.suffix}@cargotrack.test`);
    clientBToken = await login(app, `user-b-${actors.suffix}@cargotrack.test`);

    orderAId = await placeOrderFor(actors.clientAId);
    orderBId = await placeOrderFor(actors.clientBId);
  });

  afterAll(async () => {
    await destroyActors(prisma, actors);
    await app.close();
  });

  async function placeOrderFor(clientId: string): Promise<string> {
    const response = await http(app)
      .post('/api/orders')
      .set({ Authorization: `Bearer ${managerToken}` })
      .send({
        clientId,
        agreedPrice: 5000,
        currency: 'USD',
        items: [
          {
            description: 'Ceramic tiles',
            quantity: 40,
            unitCbm: 0.05,
            unitWeightKg: 22,
            unitPrice: 125,
          },
        ],
      })
      .expect(201);

    return (response.body as { id: string }).id;
  }

  const asA = () => ({ Authorization: `Bearer ${clientAToken}` });
  const asB = () => ({ Authorization: `Bearer ${clientBToken}` });

  describe('authentication', () => {
    it('refuses an unauthenticated request', async () => {
      await http(app).get('/api/orders').expect(401);
    });

    it('refuses a forged token', async () => {
      await http(app)
        .get('/api/orders')
        .set({ Authorization: 'Bearer not.a.real.token' })
        .expect(401);
    });

    it('leaves the health probe open', async () => {
      await http(app).get('/health/live').expect(200);
    });

    it('does not say whether an email exists when the password is wrong', async () => {
      const unknown = await http(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@cargotrack.test', password: 'wrong-password' })
        .expect(401);

      const wrongPassword = await http(app)
        .post('/api/auth/login')
        .send({
          email: `user-a-${actors.suffix}@cargotrack.test`,
          password: 'wrong-password',
        })
        .expect(401);

      expect((unknown.body as { message: string }).message).toBe(
        (wrongPassword.body as { message: string }).message,
      );
    });
  });

  describe('reads', () => {
    it('shows a client only their own orders', async () => {
      const response = await http(app)
        .get('/api/orders')
        .set(asA())
        .expect(200);

      const body = response.body as {
        data: { id: string; clientId: string }[];
      };

      expect(body.data.length).toBeGreaterThan(0);
      expect(
        body.data.every((order) => order.clientId === actors.clientAId),
      ).toBe(true);
    });

    it('ignores a clientId query parameter naming another client', async () => {
      const response = await http(app)
        .get(`/api/orders?clientId=${actors.clientBId}`)
        .set(asA())
        .expect(200);

      const body = response.body as { data: { clientId: string }[] };

      expect(
        body.data.every((order) => order.clientId === actors.clientAId),
      ).toBe(true);
      expect(
        body.data.some((order) => order.clientId === actors.clientBId),
      ).toBe(false);
    });

    it('answers 404 — not 403 — for another client order', async () => {
      // 403 would confirm the row exists, which is enough to enumerate ids.
      await http(app).get(`/api/orders/${orderBId}`).set(asA()).expect(404);
      await http(app).get(`/api/orders/${orderAId}`).set(asB()).expect(404);
    });

    it('hides another client status history', async () => {
      await http(app)
        .get(`/api/orders/${orderBId}/status-history`)
        .set(asA())
        .expect(404);
    });

    it('hides another client order items', async () => {
      await http(app)
        .get(`/api/orders/${orderBId}/items`)
        .set(asA())
        .expect(404);
    });

    it('hides another client company record', async () => {
      await http(app)
        .get(`/api/clients/${actors.clientBId}`)
        .set(asA())
        .expect(404);
    });

    it('collapses the client list to the caller own row', async () => {
      const response = await http(app)
        .get('/api/clients')
        .set(asA())
        .expect(200);

      const body = response.body as { data: { id: string }[] };

      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe(actors.clientAId);
    });

    it('lets the office manager see both', async () => {
      const asManager = { Authorization: `Bearer ${managerToken}` };

      await http(app).get(`/api/orders/${orderAId}`).set(asManager).expect(200);
      await http(app).get(`/api/orders/${orderBId}`).set(asManager).expect(200);
    });
  });

  describe('writes', () => {
    it('refuses to let a client place an order', async () => {
      await http(app)
        .post('/api/orders')
        .set(asA())
        .send({
          clientId: actors.clientAId,
          agreedPrice: 100,
          currency: 'USD',
        })
        .expect(403);
    });

    it('refuses to let a client move their own order along', async () => {
      await http(app)
        .post(`/api/orders/${orderAId}/status`)
        .set(asA())
        .send({ status: OrderStatus.ORDER_CONFIRMED })
        .expect(403);

      const order = await prisma.order.findUniqueOrThrow({
        where: { id: orderAId },
      });

      expect(order.status).toBe(OrderStatus.ORDER_PLACED);
    });

    it('refuses to let a client touch another client order', async () => {
      await http(app)
        .patch(`/api/orders/${orderBId}`)
        .set(asA())
        .send({ agreedPrice: 1 })
        .expect(403);
    });

    it('keeps internal counterparties out of client reach', async () => {
      await http(app).get('/api/suppliers').set(asA()).expect(403);
      await http(app).get('/api/freight-providers').set(asA()).expect(403);
      await http(app).get('/api/customs-agents').set(asA()).expect(403);
      await http(app).get('/api/users').set(asA()).expect(403);
      await http(app)
        .get(`/api/status-history?entityType=ORDER&entityId=${orderBId}`)
        .set(asA())
        .expect(403);
    });
  });
});
