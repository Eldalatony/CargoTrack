import { INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { EntityType, OrderStatus } from '@prisma/client';
import type { Response } from 'supertest';

import { FileStorageService } from '../../src/common/storage/file-storage.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OrderWalker, WALK_BALANCE } from '../fixtures/order-walk';
import {
  Actors,
  createActors,
  createTestApp,
  destroyActors,
  http,
  login,
} from '../fixtures/test-app';

/**
 * Gate 4 — the document withholding gate, proven.
 *
 *   "released_to_client_at is null until payment clears — enforced at read
 *    time on every request, not only at write time. [...] Payment delayed
 *    means file_ref is absent from the response entirely. An integration test
 *    verifies this gate cannot be bypassed by any request path."
 *
 * This is the strongest business rule in the domain, and so the most
 * complete test in the suite. Beyond the targeted cases it enumerates every
 * GET route the application registers — not a list someone keeps up to date,
 * the live routing table — and requests each one as the client, with every
 * id the fixture knows substituted into every path parameter, asserting that
 * no response anywhere carries a withheld file_ref or the file's bytes. A
 * route added next year that leaks a document is caught without anyone
 * remembering to add it here.
 *
 * gate-tests-cannot-be-skipped.spec.ts fails the unit suite if this file ever
 * contains .skip, .only or an x-prefixed test.
 */
describe('Gate 4 — the document release gate', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let actors: Actors;
  let walker: OrderWalker;
  let managerToken: string;
  let clientAToken: string;
  let clientBToken: string;

  /** Client A's order: delivered, balance invoiced, not paid. */
  let orderA: string;
  let balanceInvoiceA: string;
  /** Client B's order: delivered and paid in full. */
  let orderB: string;
  let containerId: string;

  let billOfLadingA: string;
  let packingListA: string;
  let containerManifest: string;
  let billOfLadingB: string;

  /** Written into every withheld file, so a leak of the bytes is findable. */
  const secret = `WITHHELD-BYTES-${Date.now()}`;
  const fileRefs = new Map<string, string>();

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

    orderA = await walker.place(actors.clientAId, [chairs]);
    await walker.toShipmentBooking(orderA);
    await walker.toDelivered(orderA);

    const invoice = await http(app)
      .post('/api/payments')
      .set(asManager())
      .send({
        orderId: orderA,
        paymentType: 'BALANCE',
        amount: WALK_BALANCE,
        currency: 'USD',
      })
      .expect(201);
    balanceInvoiceA = (invoice.body as { id: string }).id;

    orderB = await walker.place(actors.clientBId, [chairs]);
    await walker.toShipmentBooking(orderB);
    await walker.toDelivered(orderB);
    await walker.payBalance(orderB);

    const container = await http(app)
      .post('/api/containers')
      .set(asManager())
      .send({
        containerRef: `E2E-DOCS-${actors.suffix}`,
        containerType: '40HC',
        capacityCbm: 68,
        capacityWeightKg: 26000,
        originPort: 'Ningbo',
        destinationPort: 'Alexandria',
      })
      .expect(201);
    containerId = (container.body as { id: string }).id;

    billOfLadingA = await upload({
      docType: 'BILL_OF_LADING',
      orderId: orderA,
    });
    packingListA = await upload({ docType: 'PACKING_LIST', orderId: orderA });
    containerManifest = await upload({ docType: 'OTHER', containerId });
    billOfLadingB = await upload({
      docType: 'BILL_OF_LADING',
      orderId: orderB,
    });
  });

  afterAll(async () => {
    const storage = app.get(FileStorageService);
    const documents = await prisma.document.findMany({
      where: { OR: [{ orderId: { in: [orderA, orderB] } }, { containerId }] },
      select: { id: true, fileRef: true },
    });

    for (const document of documents) {
      await storage.remove(document.fileRef);
    }

    const ids = [containerId, ...documents.map((document) => document.id)];
    await prisma.statusHistory.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.document.deleteMany({ where: { containerId } });
    await prisma.container.deleteMany({ where: { id: containerId } });
    await destroyActors(prisma, actors);
    await app.close();
  });

  async function upload(fields: Record<string, string>): Promise<string> {
    const response = await uploadRequest(fields).expect(201);
    const id = (response.body as { id: string }).id;

    const row = await prisma.document.findUniqueOrThrow({ where: { id } });
    fileRefs.set(id, row.fileRef);

    return id;
  }

  function uploadRequest(fields: Record<string, string>) {
    let request = http(app)
      .post('/api/documents')
      .set(asManager())
      .attach('file', Buffer.from(`%PDF-1.4 ${secret}`), {
        filename: 'document.pdf',
        contentType: 'application/pdf',
      });

    for (const [key, value] of Object.entries(fields)) {
      request = request.field(key, value);
    }

    return request;
  }

  /** Every file_ref that client A must not be able to see right now. */
  function withheldFromA(): string[] {
    return [billOfLadingA, packingListA, containerManifest].map((id) =>
      fileRefs.get(id)!,
    );
  }

  /** Body as text whatever the content type, so binary leaks are visible too. */
  function asText(request: ReturnType<ReturnType<typeof http>['get']>) {
    return request.buffer(true).parse((res, callback) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (data += chunk));
      res.on('end', () => callback(null, data));
    });
  }

  function expectNoLeak(response: Response, where: string): void {
    const text = response.body as string;

    for (const fileRef of withheldFromA()) {
      // The whole reference, and the random part of it on its own — a
      // response that splits the path is still a leak.
      const token = fileRef.split('/').pop()!.split('.')[0];

      expect([where, text.includes(fileRef)]).toEqual([where, false]);
      expect([where, text.includes(token)]).toEqual([where, false]);
    }

    expect([where, text.includes(secret)]).toEqual([where, false]);
  }

  describe('while the balance is unpaid', () => {
    it('the office sees the file_ref, and that the client does not', async () => {
      const response = await http(app)
        .get(`/api/documents/${billOfLadingA}`)
        .set(asManager())
        .expect(200);

      const body = response.body as { fileRef?: string; withheld: boolean };

      expect(body.fileRef).toBe(fileRefs.get(billOfLadingA));
      expect(body.withheld).toBe(true);
    });

    it('lists the client their documents with file_ref absent, not null', async () => {
      const response = await http(app)
        .get('/api/documents')
        .set(asA())
        .expect(200);

      const { data } = response.body as {
        data: {
          id: string;
          withheld: boolean;
          withheldReason: string;
          releasedToClientAt: string | null;
        }[];
      };

      expect(data.map((doc) => doc.id).sort()).toEqual(
        [billOfLadingA, packingListA].sort(),
      );

      for (const document of data) {
        expect('fileRef' in document).toBe(false);
        expect(document.withheld).toBe(true);
        expect(document.releasedToClientAt).toBeNull();
        // Visibly pending, with the reason — not simply a missing button.
        expect(document.withheldReason).toContain(
          `${WALK_BALANCE.toFixed(2)} USD outstanding`,
        );
      }
    });

    it('withholds it from the single-document read', async () => {
      const response = await http(app)
        .get(`/api/documents/${billOfLadingA}`)
        .set(asA())
        .expect(200);

      expect('fileRef' in (response.body as object)).toBe(false);
    });

    it('withholds it from every version in the chain', async () => {
      const response = await http(app)
        .get(`/api/documents/${billOfLadingA}/versions`)
        .set(asA())
        .expect(200);

      for (const version of response.body as object[]) {
        expect('fileRef' in version).toBe(false);
      }
    });

    it('refuses the download with 403 and says why', async () => {
      const response = await asText(
        http(app).get(`/api/documents/${billOfLadingA}/file`).set(asA()),
      ).expect(403);

      expect(response.body).toContain('documents_withheld');
      expect(response.body).not.toContain(secret);
    });

    it('keeps container-level documents away from clients altogether', async () => {
      const list = await http(app)
        .get(`/api/documents?containerId=${containerId}`)
        .set(asA())
        .expect(200);

      expect((list.body as { data: unknown[] }).data).toHaveLength(0);

      await http(app)
        .get(`/api/documents/${containerManifest}`)
        .set(asA())
        .expect(404);
      await http(app)
        .get(`/api/documents/${containerManifest}/file`)
        .set(asA())
        .expect(404);
    });

    it('does not let one client reach another client documents', async () => {
      await http(app)
        .get(`/api/documents/${billOfLadingA}`)
        .set(asB())
        .expect(404);
      await http(app)
        .get(`/api/documents/${billOfLadingA}/file`)
        .set(asB())
        .expect(404);

      // And the gate is per order: B paid, so B's own document is open.
      const own = await http(app)
        .get(`/api/documents/${billOfLadingB}`)
        .set(asB())
        .expect(200);

      expect((own.body as { fileRef?: string }).fileRef).toBe(
        fileRefs.get(billOfLadingB),
      );
    });

    it('refuses to close the order out while the balance is unpaid', async () => {
      const response = await http(app)
        .post(`/api/orders/${orderA}/status`)
        .set(asManager())
        .send({ status: OrderStatus.CLOSED_OUT })
        .expect(422);

      expect(response.body).toMatchObject({
        error: 'guard_failed',
        guard: 'balance',
      });
    });

    it('cannot be bypassed by any GET route in the application', async () => {
      const routes = registeredGetRoutes(app);

      const ids = [
        orderA,
        orderB,
        billOfLadingA,
        packingListA,
        containerManifest,
        billOfLadingB,
        containerId,
        balanceInvoiceA,
        actors.clientAId,
        actors.clientBId,
        actors.clientAUserId,
      ];

      const queries = [
        '',
        '?limit=100',
        `?orderId=${orderA}&limit=100`,
        `?containerId=${containerId}&limit=100`,
        `?entityType=${EntityType.DOCUMENT}&entityId=${billOfLadingA}`,
        `?entityType=${EntityType.ORDER}&entityId=${orderA}`,
      ];

      let requests = 0;
      const visited = new Set<string>();

      for (const route of routes) {
        for (const path of expand(route, ids)) {
          for (const query of route.includes(':') ? [''] : queries) {
            const response = await asText(
              http(app)
                .get(path + query)
                .set(asA()),
            );

            expectNoLeak(response, `GET ${path}${query}`);

            if (route === '/api/documents/:id/file') {
              expect([path, response.status]).not.toEqual([path, 200]);
            }

            requests += 1;
          }
        }

        visited.add(route);
      }

      // The sweep has to have been a sweep. If route discovery ever breaks,
      // this fails instead of passing over an empty list.
      expect(routes.length).toBeGreaterThan(40);
      expect(requests).toBeGreaterThan(300);
      for (const route of [
        '/api/documents',
        '/api/documents/:id',
        '/api/documents/:id/file',
        '/api/documents/:id/versions',
        '/api/orders/:id',
        '/api/payments',
        '/api/notifications',
      ]) {
        expect(visited).toContain(route);
      }
    }, 120_000);
  });

  describe('the moment the balance clears', () => {
    it('withholds, then releases and closes out on payment', async () => {
      await http(app)
        .post(`/api/orders/${orderA}/status`)
        .set(asManager())
        .send({
          status: OrderStatus.DOCUMENTS_WITHHELD,
          reason: 'Balance not received within terms',
        })
        .expect(200);

      await http(app)
        .post(`/api/payments/${balanceInvoiceA}/paid`)
        .set(asManager())
        .send({ reference: 'TT-2026-0925' })
        .expect(200);

      const order = await prisma.order.findUniqueOrThrow({
        where: { id: orderA },
      });

      expect(order.status).toBe(OrderStatus.CLOSED_OUT);

      const history = await prisma.statusHistory.findMany({
        where: { entityType: EntityType.ORDER, entityId: orderA },
        orderBy: { changedAt: 'asc' },
      });
      const last = history[history.length - 1];

      expect([last.fromStatus, last.toStatus]).toEqual([
        OrderStatus.DOCUMENTS_WITHHELD,
        OrderStatus.CLOSED_OUT,
      ]);
      expect(last.reason).toContain('Final payment cleared');
    });

    it('stamps released_to_client_at and hands the client the file_ref', async () => {
      const response = await http(app)
        .get(`/api/documents?orderId=${orderA}`)
        .set(asA())
        .expect(200);

      const { data } = response.body as {
        data: {
          id: string;
          fileRef?: string;
          withheld: boolean;
          releasedToClientAt: string | null;
        }[];
      };

      expect(data).toHaveLength(2);

      for (const document of data) {
        expect(document.withheld).toBe(false);
        expect(document.releasedToClientAt).not.toBeNull();
        expect(document.fileRef).toBe(fileRefs.get(document.id));
      }
    });

    it('serves the file itself', async () => {
      const response = await asText(
        http(app).get(`/api/documents/${billOfLadingA}/file`).set(asA()),
      ).expect(200);

      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.body).toContain(secret);
    });

    it('records the release in each document history', async () => {
      const release = await prisma.statusHistory.findFirst({
        where: {
          entityType: EntityType.DOCUMENT,
          entityId: billOfLadingA,
          toStatus: 'RELEASED',
        },
      });

      expect(release).toMatchObject({
        fromStatus: 'WITHHELD',
        changedBy: actors.managerId,
        reason: 'Balance payment cleared',
      });
    });

    it('tells the client, through the notification pipeline', async () => {
      const notice = await prisma.notification.findFirst({
        where: {
          entityId: billOfLadingA,
          eventType: 'DOCUMENT.RELEASED',
          recipientId: actors.clientAId,
        },
      });

      expect(notice).toMatchObject({ channel: 'EMAIL', clientVisible: true });
    });
  });

  describe('enforced at read time, not only at write time', () => {
    it('withdraws the file_ref again when a refund reopens the balance', async () => {
      await http(app)
        .post('/api/payments')
        .set(asManager())
        .send({
          orderId: orderA,
          paymentType: 'REFUND',
          amount: 100,
          currency: 'USD',
          paidAt: new Date().toISOString(),
        })
        .expect(201);

      const detail = await http(app)
        .get(`/api/documents/${billOfLadingA}`)
        .set(asA())
        .expect(200);

      const body = detail.body as {
        fileRef?: string;
        withheld: boolean;
        releasedToClientAt: string | null;
      };

      // The stamp is history and stays; permission is recomputed per request.
      expect(body.releasedToClientAt).not.toBeNull();
      expect('fileRef' in body).toBe(false);
      expect(body.withheld).toBe(true);

      await http(app)
        .get(`/api/documents/${billOfLadingA}/file`)
        .set(asA())
        .expect(403);
    });

    it('opens again once the difference is paid', async () => {
      await walker.payBalance(orderA, 100);

      const detail = await http(app)
        .get(`/api/documents/${billOfLadingA}`)
        .set(asA())
        .expect(200);

      expect((detail.body as { fileRef?: string }).fileRef).toBe(
        fileRefs.get(billOfLadingA),
      );
    });
  });

  describe('version chains', () => {
    let secondVersion: string;

    it('supersedes a document with v2, released on arrival on a paid order', async () => {
      secondVersion = await upload({
        docType: 'BILL_OF_LADING',
        supersedesId: billOfLadingA,
      });

      const response = await http(app)
        .get(`/api/documents/${secondVersion}`)
        .set(asA())
        .expect(200);

      expect(response.body).toMatchObject({
        version: 2,
        supersedesId: billOfLadingA,
        orderId: orderA,
        isCurrent: true,
        withheld: false,
        fileRef: fileRefs.get(secondVersion),
      });
    });

    it('reads the whole chain, oldest first', async () => {
      const response = await http(app)
        .get(`/api/documents/${billOfLadingA}/versions`)
        .set(asManager())
        .expect(200);

      const chain = response.body as {
        id: string;
        version: number;
        isCurrent: boolean;
      }[];

      expect(chain.map((doc) => [doc.id, doc.version, doc.isCurrent])).toEqual([
        [billOfLadingA, 1, false],
        [secondVersion, 2, true],
      ]);
    });

    it('lists only current versions on request', async () => {
      const response = await http(app)
        .get(
          `/api/documents?orderId=${orderA}&docType=BILL_OF_LADING&current=true`,
        )
        .set(asManager())
        .expect(200);

      const { data } = response.body as { data: { id: string }[] };

      expect(data.map((doc) => doc.id)).toEqual([secondVersion]);
    });

    it('refuses to fork the chain from an old version', async () => {
      const response = await uploadRequest({
        docType: 'BILL_OF_LADING',
        supersedesId: billOfLadingA,
      }).expect(422);

      expect((response.body as { message: string }).message).toContain(
        'already superseded',
      );
    });

    it('refuses a new version of a different document type', async () => {
      await uploadRequest({
        docType: 'PACKING_LIST',
        supersedesId: secondVersion,
      }).expect(422);
    });

    it('lets exactly one of two concurrent revisions win', async () => {
      const responses = await Promise.all([
        uploadRequest({
          docType: 'BILL_OF_LADING',
          supersedesId: secondVersion,
        }),
        uploadRequest({
          docType: 'BILL_OF_LADING',
          supersedesId: secondVersion,
        }),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([
        201, 409,
      ]);

      const winners = await prisma.document.count({
        where: { supersedesId: secondVersion },
      });

      expect(winners).toBe(1);

      for (const response of responses.filter((r) => r.status === 201)) {
        const id = (response.body as { id: string }).id;
        const row = await prisma.document.findUniqueOrThrow({ where: { id } });
        fileRefs.set(id, row.fileRef);
      }
    });
  });
});

/**
 * Every GET route the application has registered, as the live module graph
 * describes it — read from the same controller metadata Nest routes by.
 */
function registeredGetRoutes(app: INestApplication): string[] {
  const routes = new Set<string>();

  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as (new () => object) | null;

      if (!controller) {
        continue;
      }

      const prefixes = toArray(Reflect.getMetadata(PATH_METADATA, controller));

      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = (controller.prototype as Record<string, unknown>)[name];

        if (
          typeof handler !== 'function' ||
          Reflect.getMetadata(METHOD_METADATA, handler) !== RequestMethod.GET
        ) {
          continue;
        }

        for (const prefix of prefixes) {
          for (const path of toArray(
            Reflect.getMetadata(PATH_METADATA, handler),
          )) {
            const joined = [prefix, path]
              .map((part) => part.replace(/^\/+|\/+$/g, ''))
              .filter(Boolean)
              .join('/');

            // /health sits outside the /api prefix and serves no data.
            if (!joined.startsWith('health')) {
              routes.add(`/api/${joined}`);
            }
          }
        }
      }
    }
  }

  return [...routes].sort();
}

function toArray(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [''];
  }

  return Array.isArray(value) ? (value as string[]) : [value as string];
}

/** Every way of filling the route's parameters from the known ids. */
function expand(route: string, ids: string[]): string[] {
  const parameter = /:[A-Za-z]+/;

  if (!parameter.test(route)) {
    return [route];
  }

  return ids.flatMap((id) => expand(route.replace(parameter, id), ids));
}
