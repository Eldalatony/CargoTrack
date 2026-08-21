import type { Server } from 'node:http';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { PrismaService } from '../../src/prisma/prisma.service';

export const TEST_PASSWORD = 'E2ePassword!2026';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
}

/**
 * Boots the real application — same module graph, same global pipes and
 * guards as the container runs. Requires a live Postgres and Redis, which is
 * the point: these tests prove the gate against the actual stack, not against
 * mocks that agree with the code by construction.
 *
 *   docker compose exec backend npm run test:e2e
 */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return { app, prisma: app.get(PrismaService) };
}

export function http(app: INestApplication) {
  return request(app.getHttpServer() as Server);
}

/** Exercises the real login endpoint rather than signing a token by hand. */
export async function login(
  app: INestApplication,
  email: string,
  password: string = TEST_PASSWORD,
): Promise<string> {
  const response = await http(app)
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);

  return (response.body as { accessToken: string }).accessToken;
}

export interface Actors {
  managerId: string;
  managerToken: string;
  clientAId: string;
  clientAUserId: string;
  clientAToken: string;
  clientBId: string;
  clientBUserId: string;
  clientBToken: string;
  supplierId: string;
  /** Everything created by the fixture, for teardown. */
  suffix: string;
}

/**
 * Two clients and one office manager, created directly through Prisma.
 *
 * Two clients is not padding: half of what Phase 2 has to prove is that one
 * client cannot reach the other's rows, and that needs a second client whose
 * data is real.
 */
export async function createActors(prisma: PrismaClient): Promise<Actors> {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  const clientA = await prisma.client.create({
    data: {
      companyName: `E2E Client A ${suffix}`,
      contactName: 'Alia Test',
      email: `client-a-${suffix}@cargotrack.test`,
      country: 'Egypt',
    },
  });

  const clientB = await prisma.client.create({
    data: {
      companyName: `E2E Client B ${suffix}`,
      contactName: 'Bassem Test',
      email: `client-b-${suffix}@cargotrack.test`,
      country: 'Egypt',
    },
  });

  const manager = await prisma.user.create({
    data: {
      name: `E2E Manager ${suffix}`,
      email: `manager-${suffix}@cargotrack.test`,
      passwordHash,
      role: UserRole.OFFICE_MANAGER,
    },
  });

  const userA = await prisma.user.create({
    data: {
      name: `E2E User A ${suffix}`,
      email: `user-a-${suffix}@cargotrack.test`,
      passwordHash,
      role: UserRole.CLIENT,
      clientId: clientA.id,
    },
  });

  const userB = await prisma.user.create({
    data: {
      name: `E2E User B ${suffix}`,
      email: `user-b-${suffix}@cargotrack.test`,
      passwordHash,
      role: UserRole.CLIENT,
      clientId: clientB.id,
    },
  });

  const supplier = await prisma.supplier.create({
    data: { name: `E2E Supplier ${suffix}`, country: 'China' },
  });

  return {
    managerId: manager.id,
    managerToken: '',
    clientAId: clientA.id,
    clientAUserId: userA.id,
    clientAToken: '',
    clientBId: clientB.id,
    clientBUserId: userB.id,
    clientBToken: '',
    supplierId: supplier.id,
    suffix,
  };
}

/** Removes everything the fixture created, children first. */
export async function destroyActors(
  prisma: PrismaClient,
  actors: Actors,
): Promise<void> {
  const clientIds = [actors.clientAId, actors.clientBId];

  const orders = await prisma.order.findMany({
    where: { clientId: { in: clientIds } },
    select: { id: true },
  });
  const orderIds = orders.map((order) => order.id);

  const productionOrders = await prisma.productionOrder.findMany({
    where: { orderId: { in: orderIds } },
    select: { id: true },
  });

  await prisma.statusHistory.deleteMany({
    where: {
      entityId: {
        in: [...orderIds, ...productionOrders.map((batch) => batch.id)],
      },
    },
  });
  await prisma.qcInspection.deleteMany({
    where: { productionOrderId: { in: productionOrders.map((b) => b.id) } },
  });
  await prisma.productionOrder.deleteMany({
    where: { orderId: { in: orderIds } },
  });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.clientDocument.deleteMany({
    where: { clientId: { in: clientIds } },
  });
  await prisma.user.deleteMany({
    where: {
      id: {
        in: [actors.managerId, actors.clientAUserId, actors.clientBUserId],
      },
    },
  });
  await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
  await prisma.supplier.deleteMany({ where: { id: actors.supplierId } });
}
