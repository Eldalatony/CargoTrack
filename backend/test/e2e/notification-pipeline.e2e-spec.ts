import { INestApplication } from '@nestjs/common';
import {
  EntityType,
  Notification,
  NotificationChannel,
  NotificationStatus,
  OrderStatus,
  RecipientType,
} from '@prisma/client';
import { Queue, Worker } from 'bullmq';

import { redisOptionsFromUrl } from '../../src/config/redis.config';
import { NotificationChannels } from '../../src/jobs/delivery/notification-channels';
import { NotificationDelivery } from '../../src/jobs/delivery/notification-delivery';
import { NotificationRelay } from '../../src/modules/notifications/notification-relay';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OrderWalker } from '../fixtures/order-walk';
import {
  Actors,
  createActors,
  createTestApp,
  destroyActors,
  http,
  login,
} from '../fixtures/test-app';

/**
 * Gate 4 — "The retry pipeline correctly cycles through failure, retry, and
 * dead-letter states."
 *
 * The retry cases run the production delivery code (NotificationDelivery,
 * and NotificationChannels where the real failure modes matter) under a real
 * BullMQ worker on a queue of their own. Their own queue so the live worker
 * cannot steal the jobs; real BullMQ so the attempts, backoff and failed set
 * are BullMQ's, not a loop written to agree with the assertions.
 *
 * One case goes the whole way through the running stack instead: a status
 * change in the API, the outbox row, the relay, Redis, the worker container,
 * SENT.
 */
describe('Gate 4 — the notification pipeline', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let actors: Actors;
  let walker: OrderWalker;
  let managerToken: string;
  let clientAToken: string;
  let clientBToken: string;

  let queue: Queue;
  let worker: Worker;
  let bounceClientId: string;
  let orderId: string;

  /** Per-notification stand-in for the provider; defaults to the real one. */
  const behaviours = new Map<string, (n: Notification) => Promise<void>>();
  const connection = () => redisOptionsFromUrl(process.env.REDIS_URL!);

  const asManager = () => ({ Authorization: `Bearer ${managerToken}` });
  const asA = () => ({ Authorization: `Bearer ${clientAToken}` });
  const asB = () => ({ Authorization: `Bearer ${clientBToken}` });

  const chairs = {
    description: 'Rattan dining chairs',
    quantity: 10,
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
    orderId = await walker.place(actors.clientAId, [chairs]);

    const bounce = await prisma.client.create({
      data: {
        companyName: `E2E Bounce ${actors.suffix}`,
        contactName: 'Nobody Home',
        email: `accounts@bounce-${actors.suffix}.invalid`,
        country: 'Egypt',
      },
    });
    bounceClientId = bounce.id;

    const real = new NotificationChannels(prisma);
    const channels = {
      deliver: (n: Notification) =>
        (behaviours.get(n.id) ?? ((row) => real.deliver(row)))(n),
    } as NotificationChannels;
    const delivery = new NotificationDelivery(prisma, channels);

    queue = new Queue(`notifications-e2e-${actors.suffix}`, {
      connection: connection(),
    });
    worker = new Worker<{ notificationId: string }>(
      queue.name,
      (job) =>
        delivery.attempt(job.data.notificationId, {
          attemptsMade: job.attemptsMade,
          maxAttempts: job.opts.attempts ?? 1,
        }),
      { connection: connection() },
    );
  });

  afterAll(async () => {
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await prisma.notification.deleteMany({
      where: { recipientId: bounceClientId },
    });
    await destroyActors(prisma, actors);
    await prisma.client.delete({ where: { id: bounceClientId } });
    await app.close();
  });

  function notificationsFor(entityId: string) {
    return prisma.notification.findMany({
      where: { entityId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async function waitFor(
    id: string,
    done: (row: Notification) => boolean,
    timeoutMs = 20_000,
  ): Promise<Notification> {
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      const row = await prisma.notification.findUniqueOrThrow({
        where: { id },
      });

      if (done(row) || Date.now() > deadline) {
        return row;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  const settled = (row: Notification) =>
    row.status === NotificationStatus.SENT ||
    row.status === NotificationStatus.DEAD_LETTER;

  /** A row as the outbox would write it, queued on the isolated queue. */
  async function enqueueIsolated(
    recipientId: string = actors.clientAId,
  ): Promise<string> {
    const row = await prisma.notification.create({
      data: {
        eventType: 'ORDER.E2E_RETRY_PROBE',
        entityType: EntityType.ORDER,
        entityId: orderId,
        recipientType: RecipientType.CLIENT,
        recipientId,
        channel: NotificationChannel.EMAIL,
      },
    });

    await queue.add(
      row.eventType,
      { notificationId: row.id },
      { jobId: row.id, attempts: 3, backoff: { type: 'fixed', delay: 100 } },
    );

    return row.id;
  }

  describe('every status transition fans out', () => {
    it('writes a client email for an order moving', async () => {
      const rows = await notificationsFor(orderId);

      expect(rows[0]).toMatchObject({
        eventType: 'ORDER.ORDER_PLACED',
        entityType: EntityType.ORDER,
        recipientType: RecipientType.CLIENT,
        recipientId: actors.clientAId,
        channel: NotificationChannel.EMAIL,
        clientVisible: true,
      });
    });

    it('writes the deposit and the confirmation from one request', async () => {
      await walker.confirm(orderId);

      const events = (await notificationsFor(orderId)).map(
        (row) => row.eventType,
      );
      expect(events).toContain('ORDER.ORDER_CONFIRMED');

      const deposit = await prisma.payment.findFirstOrThrow({
        where: { orderId },
      });
      const paymentRows = await notificationsFor(deposit.id);

      expect(paymentRows.map((row) => row.eventType)).toEqual(['PAYMENT.PAID']);
    });

    it('routes internal changes to the office inbox, hidden from clients', async () => {
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

      const rows = await notificationsFor((batch.body as { id: string }).id);

      expect(rows.length).toBeGreaterThan(0);
      expect(rows.map((row) => row.recipientId)).toContain(actors.managerId);

      for (const row of rows) {
        expect(row).toMatchObject({
          recipientType: RecipientType.USER,
          channel: NotificationChannel.IN_APP,
          clientVisible: false,
        });
      }
    });

    it('notifies no one about a transition that was refused', async () => {
      const before = await prisma.notification.count({
        where: { entityId: orderId },
      });

      await http(app)
        .post(`/api/orders/${orderId}/status`)
        .set(asManager())
        .send({ status: OrderStatus.DELIVERED })
        .expect(422);

      const after = await prisma.notification.count({
        where: { entityId: orderId },
      });

      expect(after).toBe(before);
    });
  });

  describe('through the running stack', () => {
    it('relays the row to Redis and the worker container delivers it', async () => {
      const [placed] = await notificationsFor(orderId);

      await app.get(NotificationRelay).flush();

      const row = await waitFor(placed.id, settled);

      expect(row.status).toBe(NotificationStatus.SENT);
      expect(row.sentAt).not.toBeNull();
      expect(row.lastError).toBeNull();
    });
  });

  describe('failure, retry, dead letter', () => {
    it('retries a transient failure and delivers on the third attempt', async () => {
      const id = await enqueueIsolated();
      const seenAtPickup: NotificationStatus[] = [];
      const seenDuring: NotificationStatus[] = [];

      behaviours.set(id, async (row) => {
        seenAtPickup.push(row.status);
        seenDuring.push(
          (await prisma.notification.findUniqueOrThrow({ where: { id } }))
            .status,
        );

        if (seenAtPickup.length < 3) {
          throw new Error('421 Service not available, try again later');
        }
      });

      const row = await waitFor(id, settled);

      // PENDING on the first pickup, FAILED waiting for each retry, and
      // RETRYING while every attempt is in flight.
      expect(seenAtPickup).toEqual([
        NotificationStatus.PENDING,
        NotificationStatus.FAILED,
        NotificationStatus.FAILED,
      ]);
      expect(seenDuring).toEqual([
        NotificationStatus.RETRYING,
        NotificationStatus.RETRYING,
        NotificationStatus.RETRYING,
      ]);
      expect(row).toMatchObject({
        status: NotificationStatus.SENT,
        retryCount: 2,
        lastError: null,
      });
      expect(row.sentAt).not.toBeNull();
    });

    it('dead-letters after the last attempt and keeps the error', async () => {
      const id = await enqueueIsolated();
      let attempts = 0;

      behaviours.set(id, () => {
        attempts += 1;
        return Promise.reject(new Error('552 Mailbox full'));
      });

      const row = await waitFor(id, settled);

      expect(attempts).toBe(3);
      expect(row).toMatchObject({
        status: NotificationStatus.DEAD_LETTER,
        retryCount: 3,
        lastError: '552 Mailbox full',
        sentAt: null,
      });

      // removeOnFail: false — BullMQ keeps the job for inspection.
      expect(await (await queue.getJob(id))!.getState()).toBe('failed');
    });

    it('walks the whole retry path for a mailbox that cannot exist', async () => {
      const id = await enqueueIsolated(bounceClientId);

      const row = await waitFor(id, settled);

      expect(row.status).toBe(NotificationStatus.DEAD_LETTER);
      expect(row.retryCount).toBe(3);
      expect(row.lastError).toContain('Mailbox unreachable');
    });

    it('dead-letters an unknown recipient at once — retrying cannot help', async () => {
      const id = await enqueueIsolated('00000000-0000-4000-8000-000000000000');

      const row = await waitFor(id, settled);

      expect(row.status).toBe(NotificationStatus.DEAD_LETTER);
      expect(row.retryCount).toBe(1);
      expect(row.lastError).toContain('has no EMAIL address');
    });
  });

  describe('the Office Manager dashboard', () => {
    let deadId: string;

    beforeAll(async () => {
      deadId = await enqueueIsolated();
      behaviours.set(deadId, () =>
        Promise.reject(new Error('Provider outage')),
      );
      await waitFor(deadId, settled);
    });

    it('surfaces dead letters with their retry count and last error', async () => {
      const response = await http(app)
        .get(
          `/api/notifications?status=DEAD_LETTER&entityId=${orderId}&limit=100`,
        )
        .set(asManager())
        .expect(200);

      const row = (
        response.body as {
          data: { id: string; retryCount: number; lastError: string }[];
        }
      ).data.find((n) => n.id === deadId);

      expect(row).toMatchObject({
        retryCount: 3,
        lastError: 'Provider outage',
      });

      const summary = await http(app)
        .get('/api/notifications/summary')
        .set(asManager())
        .expect(200);

      expect(
        (summary.body as Record<NotificationStatus, number>).DEAD_LETTER,
      ).toBeGreaterThanOrEqual(1);
    });

    it('re-queues a dead letter once the fault is fixed, and it delivers', async () => {
      const response = await http(app)
        .post(`/api/notifications/${deadId}/retry`)
        .set(asManager())
        .expect(200);

      expect(response.body).toMatchObject({
        status: NotificationStatus.PENDING,
        retryCount: 0,
      });

      // Retried onto the live queue: the worker container, with the real
      // provider, delivers it.
      const row = await waitFor(deadId, settled);

      expect(row.status).toBe(NotificationStatus.SENT);
    });

    it('only retries dead letters', async () => {
      await http(app)
        .post(`/api/notifications/${deadId}/retry`)
        .set(asManager())
        .expect(422);
    });

    it('keeps the dashboard views to the office', async () => {
      await http(app).get('/api/notifications/summary').set(asA()).expect(403);
      await http(app)
        .post(`/api/notifications/${deadId}/retry`)
        .set(asA())
        .expect(403);
    });
  });

  describe('the client inbox', () => {
    it('shows a client only their own client-visible messages', async () => {
      const response = await http(app)
        .get('/api/notifications?limit=100')
        .set(asA())
        .expect(200);

      const { data } = response.body as { data: Notification[] };

      expect(data.length).toBeGreaterThan(0);

      for (const row of data) {
        expect(row).toMatchObject({
          recipientType: RecipientType.CLIENT,
          recipientId: actors.clientAId,
          clientVisible: true,
        });
      }

      const other = await http(app)
        .get(`/api/notifications?entityId=${orderId}`)
        .set(asB())
        .expect(200);

      expect((other.body as { data: unknown[] }).data).toHaveLength(0);
    });
  });
});
