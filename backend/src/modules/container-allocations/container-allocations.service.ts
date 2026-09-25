import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Container,
  ContainerAllocation,
  ContainerStatus,
  OrderStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { allocatedLoad, assertFits } from '../containers/container-capacity';
import { lockContainer } from '../containers/container-lock';
import { CreateAllocationDto } from './dto/create-allocation.dto';
import { UpdateAllocationDto } from './dto/update-allocation.dto';

/**
 * An order can be put in a box once it is ready to ship and before it sails.
 * SHIPMENT_BOOKING is where the order diagram books the container; the order
 * may already have moved on to ROUTE_DECISION by the time the office gets to
 * the allocation screen.
 */
const ALLOCATABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.SHIPMENT_BOOKING,
  OrderStatus.ROUTE_DECISION,
];

const INCLUDE = {
  order: {
    select: {
      id: true,
      status: true,
      totalCbm: true,
      totalWeightKg: true,
      client: { select: { id: true, companyName: true } },
    },
  },
} satisfies Prisma.ContainerAllocationInclude;

/**
 * CONTAINER_ALLOCATIONS: consolidated shipping. One container, many orders,
 * CBM and weight tracked per row.
 *
 * Every write here runs under the container's row lock (see lockContainer).
 * That is what makes the capacity guard a guarantee rather than a best effort.
 */
@Injectable()
export class ContainerAllocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    containerId: string,
    dto: CreateAllocationDto,
  ): Promise<ContainerAllocation> {
    return this.prisma.$transaction(async (tx) => {
      const container = await lockContainer(tx, containerId);
      assertOpen(container);

      const order = await tx.order.findUnique({
        where: { id: dto.orderId },
        select: { id: true, status: true, totalCbm: true, totalWeightKg: true },
      });

      if (!order) {
        throw new BadRequestException(`Order ${dto.orderId} does not exist`);
      }

      if (!ALLOCATABLE_ORDER_STATUSES.includes(order.status)) {
        throw new UnprocessableEntityException(
          `Only an order in ${ALLOCATABLE_ORDER_STATUSES.join(' or ')} can be allocated to a container. Order ${order.id} is ${order.status}`,
        );
      }

      const cbm = dto.allocatedCbm ?? order.totalCbm;
      const weightKg = dto.allocatedWeightKg ?? order.totalWeightKg;

      if (cbm === null || weightKg === null) {
        throw new BadRequestException(
          `Order ${order.id} has no computed volume or weight. Give allocatedCbm and allocatedWeightKg explicitly`,
        );
      }

      const adding = {
        cbm: new Prisma.Decimal(cbm),
        weightKg: new Prisma.Decimal(weightKg),
      };

      assertFits(
        capacityOf(container),
        await allocatedLoad(tx, containerId),
        adding,
      );

      // A second allocation of the same order to the same box trips the
      // (container_id, order_id) unique index — 409 via the Prisma filter.
      return tx.containerAllocation.create({
        data: {
          containerId,
          orderId: order.id,
          allocatedCbm: adding.cbm,
          allocatedWeightKg: adding.weightKg,
          allocatedCost:
            dto.allocatedCost === undefined
              ? null
              : new Prisma.Decimal(dto.allocatedCost),
          currency: dto.currency ?? null,
        },
        include: INCLUDE,
      });
    });
  }

  async findAll(containerId: string): Promise<ContainerAllocation[]> {
    const container = await this.prisma.container.findUnique({
      where: { id: containerId },
      select: { id: true },
    });

    if (!container) {
      throw new NotFoundException(`Container ${containerId} not found`);
    }

    return this.prisma.containerAllocation.findMany({
      where: { containerId },
      include: INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(
    containerId: string,
    id: string,
    dto: UpdateAllocationDto,
  ): Promise<ContainerAllocation> {
    return this.prisma.$transaction(async (tx) => {
      const container = await lockContainer(tx, containerId);
      assertOpen(container);

      const allocation = await requireAllocation(tx, containerId, id);

      const next = {
        cbm: new Prisma.Decimal(dto.allocatedCbm ?? allocation.allocatedCbm),
        weightKg: new Prisma.Decimal(
          dto.allocatedWeightKg ?? allocation.allocatedWeightKg,
        ),
      };

      // Measured against everything else in the box, so resizing a row
      // never counts its own old size against itself.
      assertFits(
        capacityOf(container),
        await allocatedLoad(tx, containerId, id),
        next,
      );

      const allocatedCost =
        dto.allocatedCost === undefined
          ? allocation.allocatedCost
          : new Prisma.Decimal(dto.allocatedCost);
      const currency = dto.currency ?? allocation.currency;

      if (allocatedCost !== null && !currency) {
        throw new BadRequestException(
          'currency is required when an allocated cost is set',
        );
      }

      return tx.containerAllocation.update({
        where: { id },
        data: {
          allocatedCbm: next.cbm,
          allocatedWeightKg: next.weightKg,
          allocatedCost,
          currency,
        },
        include: INCLUDE,
      });
    });
  }

  async remove(containerId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const container = await lockContainer(tx, containerId);
      assertOpen(container);

      await requireAllocation(tx, containerId, id);

      await tx.containerAllocation.delete({ where: { id } });
    });
  }
}

/**
 * FULLY_ALLOCATED means the booking is locked with the freight provider —
 * the manifest is what was declared, and changing it is not an edit here.
 */
function assertOpen(container: Container): void {
  if (container.status !== ContainerStatus.OPEN_FOR_ALLOCATION) {
    throw new UnprocessableEntityException(
      `Allocations can only change while a container is OPEN_FOR_ALLOCATION. ${container.containerRef} is ${container.status}`,
    );
  }
}

function capacityOf(container: Container) {
  return { cbm: container.capacityCbm, weightKg: container.capacityWeightKg };
}

async function requireAllocation(
  tx: Prisma.TransactionClient,
  containerId: string,
  id: string,
): Promise<ContainerAllocation> {
  const allocation = await tx.containerAllocation.findFirst({
    where: { id, containerId },
  });

  if (!allocation) {
    throw new NotFoundException(
      `Allocation ${id} not found in container ${containerId}`,
    );
  }

  return allocation;
}
