import { INestApplication } from '@nestjs/common';
import { ContainerStatus, EntityType, StockStatus } from '@prisma/client';

import { CONTAINER_HAPPY_PATH } from '../../src/common/state-machines/container.state-machine';
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
 * Gate 3, executed rather than asserted about.
 *
 *   "A container can be opened, allocated orders in a consolidated scenario,
 *    departed, optionally transited, arrived, and closed — but only after all
 *    allocated orders have closed. Capacity guard is tested at the boundary
 *    value."
 *
 * As with Gate 2, every move goes over HTTP.
 */
describe('Gate 3 — the shipping lifecycle over the API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let actors: Actors;
  let managerToken: string;
  let walker: OrderWalker;

  const containerIds: string[] = [];
  const warehouseIds: string[] = [];
  const stockRecordIds: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    actors = await createActors(prisma);
    managerToken = await login(app, `manager-${actors.suffix}@cargotrack.test`);
    walker = new OrderWalker(app, managerToken, actors.supplierId);
  });

  afterAll(async () => {
    await prisma.statusHistory.deleteMany({
      where: {
        OR: [
          { entityType: EntityType.CONTAINER, entityId: { in: containerIds } },
          {
            entityType: EntityType.STOCK_RECORD,
            entityId: { in: stockRecordIds },
          },
        ],
      },
    });
    // Allocations and transit legs cascade with their container.
    await prisma.container.deleteMany({ where: { id: { in: containerIds } } });
    // Stock records cascade with the order items destroyActors removes.
    await destroyActors(prisma, actors);
    await prisma.warehouse.deleteMany({ where: { id: { in: warehouseIds } } });
    await app.close();
  });

  const asManager = () => ({ Authorization: `Bearer ${managerToken}` });

  async function openContainer(overrides: Record<string, unknown> = {}) {
    const response = await http(app)
      .post('/api/containers')
      .set(asManager())
      .send({
        containerRef: `E2E-${actors.suffix}-${containerIds.length}`,
        containerType: '20GP',
        capacityCbm: 20,
        capacityWeightKg: 5000,
        originPort: 'Shanghai',
        destinationPort: 'Alexandria',
        ...overrides,
      })
      .expect(201);

    const id = (response.body as { id: string }).id;
    containerIds.push(id);

    return id;
  }

  function moveContainer(id: string, status: ContainerStatus) {
    return http(app)
      .post(`/api/containers/${id}/status`)
      .set(asManager())
      .send({ status });
  }

  function allocate(containerId: string, body: Record<string, unknown>) {
    return http(app)
      .post(`/api/containers/${containerId}/allocations`)
      .set(asManager())
      .send(body);
  }

  /** 120 x 0.085 = 10.2 CBM, 120 x 4.2 = 504 kg. */
  const chairs = {
    description: 'Rattan dining chairs',
    quantity: 120,
    unitCbm: 0.085,
    unitWeightKg: 4.2,
    unitPrice: 150,
  };

  /** 98 x 0.1 = 9.8 CBM, 98 x 12 = 1176 kg. Chairs + tables = exactly 20. */
  const tables = {
    description: 'Teak side tables',
    quantity: 98,
    unitCbm: 0.1,
    unitWeightKg: 12,
    unitPrice: 80,
  };

  describe('consolidated container, transit route, end to end', () => {
    let containerId: string;
    let orderA: string;
    let orderB: string;

    beforeAll(async () => {
      // Two different clients' orders — that is what consolidated means.
      orderA = await walker.place(actors.clientAId, [chairs]);
      orderB = await walker.place(actors.clientBId, [tables]);
      await walker.toShipmentBooking(orderA);
      await walker.toShipmentBooking(orderB);

      containerId = await openContainer({ routeType: 'TRANSIT' });
    });

    it('opens in OPEN_FOR_ALLOCATION with an opening history row', async () => {
      const response = await http(app)
        .get(`/api/containers/${containerId}`)
        .set(asManager())
        .expect(200);

      expect((response.body as { status: string }).status).toBe(
        ContainerStatus.OPEN_FOR_ALLOCATION,
      );
    });

    it('allocates the first order at its computed volume and weight', async () => {
      const response = await allocate(containerId, { orderId: orderA }).expect(
        201,
      );

      const body = response.body as {
        allocatedCbm: string;
        allocatedWeightKg: string;
      };

      expect(Number(body.allocatedCbm)).toBeCloseTo(10.2, 3);
      expect(Number(body.allocatedWeightKg)).toBeCloseTo(504, 3);
    });

    it('refuses to put the same order in the same box twice', async () => {
      // Plenty of room left, so this is the unique index talking, not the
      // capacity guard.
      await allocate(containerId, {
        orderId: orderA,
        allocatedCbm: 0.001,
        allocatedWeightKg: 0.001,
      }).expect(409);
    });

    it('rejects one thousandth of a CBM past capacity (boundary + 0.001)', async () => {
      const response = await allocate(containerId, {
        orderId: orderB,
        allocatedCbm: 9.801,
        allocatedWeightKg: 1176,
      }).expect(422);

      expect((response.body as { message: string }).message).toMatch(
        /exceeds container capacity.*9\.8 CBM of 20 left/,
      );
    });

    it('accepts a second client order that fills it exactly (boundary)', async () => {
      await allocate(containerId, { orderId: orderB }).expect(201);

      const response = await http(app)
        .get(`/api/containers/${containerId}`)
        .set(asManager())
        .expect(200);

      const { utilization, allocations } = response.body as {
        utilization: { cbmPercent: number; remainingCbm: string };
        allocations: { order: { client: { id: string } } }[];
      };

      expect(utilization.cbmPercent).toBe(100);
      expect(Number(utilization.remainingCbm)).toBe(0);
      expect(new Set(allocations.map((a) => a.order.client.id))).toEqual(
        new Set([actors.clientAId, actors.clientBId]),
      );
    });

    it('locks allocations once the booking is confirmed', async () => {
      await moveContainer(containerId, ContainerStatus.FULLY_ALLOCATED).expect(
        200,
      );

      const allocations = await http(app)
        .get(`/api/containers/${containerId}/allocations`)
        .set(asManager())
        .expect(200);

      const first = (allocations.body as { id: string }[])[0];

      await http(app)
        .delete(`/api/containers/${containerId}/allocations/${first.id}`)
        .set(asManager())
        .expect(422);
    });

    it('will not sail a transit container with no stops planned', async () => {
      const response = await moveContainer(
        containerId,
        ContainerStatus.DEPARTED,
      ).expect(422);

      expect((response.body as { message: string }).message).toContain(
        'transit leg',
      );
    });

    it('departs once the stop is planned', async () => {
      await http(app)
        .post(`/api/containers/${containerId}/transit-legs`)
        .set(asManager())
        .send({ port: 'Jebel Ali' })
        .expect(201);

      const response = await moveContainer(
        containerId,
        ContainerStatus.DEPARTED,
      ).expect(200);

      expect((response.body as { departedAt: string }).departedAt).toBeTruthy();
    });

    it('will not arrive while a transit stop is unfinished', async () => {
      const response = await moveContainer(
        containerId,
        ContainerStatus.ARRIVED,
      ).expect(422);

      expect((response.body as { message: string }).message).toContain(
        'Jebel Ali',
      );
    });

    it('records the transit stop in voyage order', async () => {
      const legs = await http(app)
        .get(`/api/containers/${containerId}/transit-legs`)
        .set(asManager())
        .expect(200);

      const leg = (legs.body as { id: string; sequence: number }[])[0];
      expect(leg.sequence).toBe(1);

      // Cannot leave a port before reaching it.
      await http(app)
        .post(`/api/containers/${containerId}/transit-legs/${leg.id}/departure`)
        .set(asManager())
        .send({})
        .expect(422);

      await http(app)
        .post(`/api/containers/${containerId}/transit-legs/${leg.id}/arrival`)
        .set(asManager())
        .send({})
        .expect(200);

      await http(app)
        .post(`/api/containers/${containerId}/transit-legs/${leg.id}/departure`)
        .set(asManager())
        .send({})
        .expect(200);
    });

    it('arrives once the sub-flow has rejoined', async () => {
      await moveContainer(containerId, ContainerStatus.ARRIVED).expect(200);
    });

    it('cannot close while any allocated order is still open', async () => {
      const response = await moveContainer(
        containerId,
        ContainerStatus.CLOSED,
      ).expect(422);

      const { message } = response.body as { message: string };
      expect(message).toContain(orderA);
      expect(message).toContain(orderB);
    });

    it('still cannot close when only one of the two orders has closed out', async () => {
      await walker.toClosedOut(orderA);

      const response = await moveContainer(
        containerId,
        ContainerStatus.CLOSED,
      ).expect(422);

      const { message } = response.body as { message: string };
      expect(message).not.toContain(orderA);
      expect(message).toContain(orderB);
    });

    it('closes once every allocated order is CLOSED_OUT', async () => {
      await walker.toClosedOut(orderB);

      await moveContainer(containerId, ContainerStatus.CLOSED).expect(200);
      await moveContainer(containerId, ContainerStatus.ARRIVED).expect(422);
    });

    it('left a status history row for every step, with no gaps', async () => {
      const response = await http(app)
        .get(`/api/containers/${containerId}/status-history`)
        .set(asManager())
        .expect(200);

      const history = response.body as {
        fromStatus: string | null;
        toStatus: string;
        changedBy: string;
      }[];

      expect(history.map((row) => row.toStatus)).toEqual([
        ...CONTAINER_HAPPY_PATH,
      ]);
      expect(history[0].fromStatus).toBeNull();
      history.slice(1).forEach((row, index) => {
        expect(row.fromStatus).toBe(history[index].toStatus);
      });
      expect(history.every((row) => row.changedBy === actors.managerId)).toBe(
        true,
      );
    });
  });

  describe('capacity guard', () => {
    it('stops on weight even with volume to spare', async () => {
      const orderId = await walker.place(actors.clientAId, [chairs]);
      await walker.toShipmentBooking(orderId);

      // 504 kg of chairs into a box rated for 500.
      const containerId = await openContainer({ capacityWeightKg: 500 });

      const response = await allocate(containerId, { orderId }).expect(422);

      expect((response.body as { message: string }).message).toContain(
        'kg requested',
      );
    });

    it('lets exactly one of two racing allocations take the last space', async () => {
      const first = await walker.place(actors.clientAId, [chairs]);
      const second = await walker.place(actors.clientBId, [chairs]);
      await walker.toShipmentBooking(first);
      await walker.toShipmentBooking(second);

      // Room for one 10.2 CBM order, not two.
      const containerId = await openContainer({ capacityCbm: 15 });

      const results = await Promise.all([
        allocate(containerId, { orderId: first }),
        allocate(containerId, { orderId: second }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 422]);

      const allocations = await prisma.containerAllocation.count({
        where: { containerId },
      });
      expect(allocations).toBe(1);
    });

    it('refuses an order that is not ready to ship', async () => {
      const orderId = await walker.place(actors.clientAId, [chairs]);
      const containerId = await openContainer();

      await allocate(containerId, { orderId }).expect(422);
    });

    it('will not shrink a container below what it already carries', async () => {
      const orderId = await walker.place(actors.clientAId, [chairs]);
      await walker.toShipmentBooking(orderId);
      const containerId = await openContainer();

      await allocate(containerId, { orderId }).expect(201);

      await http(app)
        .patch(`/api/containers/${containerId}`)
        .set(asManager())
        .send({ capacityCbm: 10 })
        .expect(422);
    });
  });

  describe('direct route', () => {
    it('takes no transit legs and sails straight through', async () => {
      const orderId = await walker.place(actors.clientAId, [chairs]);
      await walker.toShipmentBooking(orderId);
      const containerId = await openContainer();

      await http(app)
        .post(`/api/containers/${containerId}/transit-legs`)
        .set(asManager())
        .send({ port: 'Jeddah' })
        .expect(422);

      await allocate(containerId, { orderId }).expect(201);

      for (const status of [
        ContainerStatus.FULLY_ALLOCATED,
        ContainerStatus.DEPARTED,
        ContainerStatus.ARRIVED,
      ]) {
        await moveContainer(containerId, status).expect(200);
      }
    });

    it('rejects a skipped state with a clear error', async () => {
      const containerId = await openContainer();

      const response = await moveContainer(
        containerId,
        ContainerStatus.DEPARTED,
      ).expect(422);

      expect((response.body as { message: string }).message).toContain(
        'Valid transitions from OPEN_FOR_ALLOCATION: FULLY_ALLOCATED',
      );
    });

    it('will not book an empty container', async () => {
      const containerId = await openContainer();

      await moveContainer(containerId, ContainerStatus.FULLY_ALLOCATED).expect(
        422,
      );
    });
  });

  describe('warehousing', () => {
    let warehouseId: string;
    let orderItemId: string;

    beforeAll(async () => {
      const warehouse = await http(app)
        .post('/api/warehouses')
        .set(asManager())
        .send({ name: `E2E Warehouse ${actors.suffix}`, country: 'Egypt' })
        .expect(201);

      warehouseId = (warehouse.body as { id: string }).id;
      warehouseIds.push(warehouseId);

      const orderId = await walker.place(actors.clientAId, [chairs]);
      const item = await prisma.orderItem.findFirstOrThrow({
        where: { orderId },
      });
      orderItemId = item.id;
    });

    function receive(quantity: number) {
      return http(app)
        .post('/api/stock-records')
        .set(asManager())
        .send({ warehouseId, orderItemId, quantity });
    }

    it('receives stock up to the ordered quantity and no further', async () => {
      const first = await receive(100).expect(201);
      stockRecordIds.push((first.body as { id: string }).id);

      const response = await receive(21).expect(422);
      expect((response.body as { message: string }).message).toContain(
        '100 are already in a warehouse',
      );
    });

    it('holds with a free-text reason, lifts, holds again, releases', async () => {
      const id = stockRecordIds[0];

      await http(app)
        .post(`/api/stock-records/${id}/hold`)
        .set(asManager())
        .send({})
        .expect(400);

      const held = await http(app)
        .post(`/api/stock-records/${id}/hold`)
        .set(asManager())
        .send({ holdReason: 'Client waiting out Ramadan demand' })
        .expect(200);

      expect(held.body as { status: string; holdReason: string }).toMatchObject(
        {
          status: StockStatus.ON_HOLD,
          holdReason: 'Client waiting out Ramadan demand',
        },
      );

      await http(app)
        .post(`/api/stock-records/${id}/lift-hold`)
        .set(asManager())
        .send({})
        .expect(200);

      await http(app)
        .post(`/api/stock-records/${id}/hold`)
        .set(asManager())
        .send({ holdReason: 'Customs query on HS code' })
        .expect(200);

      const released = await http(app)
        .post(`/api/stock-records/${id}/release`)
        .set(asManager())
        .send({})
        .expect(200);

      const body = released.body as {
        status: string;
        releasedAt: string;
        holdReason: string;
      };
      expect(body.status).toBe(StockStatus.RELEASED);
      expect(body.releasedAt).toBeTruthy();
      // Kept, so received_at → released_at reads as the hold it was.
      expect(body.holdReason).toBe('Customs query on HS code');

      await http(app)
        .post(`/api/stock-records/${id}/hold`)
        .set(asManager())
        .send({ holdReason: 'Too late' })
        .expect(422);
    });

    it('frees the quantity once the goods have left', async () => {
      const again = await receive(21).expect(201);
      stockRecordIds.push((again.body as { id: string }).id);
    });

    it('audits every stock movement', async () => {
      const response = await http(app)
        .get(`/api/stock-records/${stockRecordIds[0]}/status-history`)
        .set(asManager())
        .expect(200);

      expect(
        (response.body as { toStatus: string }[]).map((row) => row.toStatus),
      ).toEqual([
        StockStatus.IN_STOCK,
        StockStatus.ON_HOLD,
        StockStatus.IN_STOCK,
        StockStatus.ON_HOLD,
        StockStatus.RELEASED,
      ]);
    });

    it('will not delete a warehouse that has held stock', async () => {
      await http(app)
        .delete(`/api/warehouses/${warehouseId}`)
        .set(asManager())
        .expect(409);
    });
  });

  describe('access', () => {
    it('keeps containers, warehouses and stock away from clients', async () => {
      const clientToken = await login(
        app,
        `user-a-${actors.suffix}@cargotrack.test`,
      );
      const asClient = { Authorization: `Bearer ${clientToken}` };

      for (const path of [
        '/api/containers',
        '/api/warehouses',
        '/api/stock-records',
      ]) {
        await http(app).get(path).set(asClient).expect(403);
      }
    });
  });
});
