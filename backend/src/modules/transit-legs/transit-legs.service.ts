import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Container,
  ContainerStatus,
  Prisma,
  RouteType,
  TransitLeg,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { lockContainer } from '../containers/container-lock';
import { CreateTransitLegDto } from './dto/create-transit-leg.dto';
import { RecordLegEventDto } from './dto/record-leg-event.dto';
import { UpdateTransitLegDto } from './dto/update-transit-leg.dto';

/** Legs can be planned up to, and during, the voyage — not after it. */
const PLANNABLE_STATUSES: readonly ContainerStatus[] = [
  ContainerStatus.OPEN_FOR_ALLOCATION,
  ContainerStatus.FULLY_ALLOCATED,
  ContainerStatus.DEPARTED,
];

/**
 * TRANSIT_LEGS: the optional sub-flow of the container lifecycle. A direct
 * container has none; a transit container has one row per stop, each with an
 * arrival and a departure, and the container cannot reach ARRIVED until the
 * last of them has departed.
 *
 * Events are recorded in voyage order. A box cannot arrive at stop 2 before
 * it has left stop 1, and cannot leave a port before it has reached it — the
 * rows are checked against each other so the timeline they draw is one that
 * could have happened.
 */
@Injectable()
export class TransitLegsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    containerId: string,
    dto: CreateTransitLegDto,
  ): Promise<TransitLeg> {
    return this.prisma.$transaction(async (tx) => {
      const container = await lockContainer(tx, containerId);
      assertTransitRoute(container);
      assertPlannable(container);

      const last = await tx.transitLeg.findFirst({
        where: { containerId },
        orderBy: { sequence: 'desc' },
      });

      const sequence = dto.sequence ?? (last?.sequence ?? 0) + 1;

      await assertNotBeforeVisitedStop(tx, containerId, sequence);

      // A clashing sequence number trips the (container_id, sequence)
      // unique index and comes back as 409.
      return tx.transitLeg.create({
        data: { containerId, port: dto.port, sequence },
      });
    });
  }

  async findAll(containerId: string): Promise<TransitLeg[]> {
    const container = await this.prisma.container.findUnique({
      where: { id: containerId },
      select: { id: true },
    });

    if (!container) {
      throw new NotFoundException(`Container ${containerId} not found`);
    }

    return this.prisma.transitLeg.findMany({
      where: { containerId },
      orderBy: { sequence: 'asc' },
    });
  }

  async update(
    containerId: string,
    id: string,
    dto: UpdateTransitLegDto,
  ): Promise<TransitLeg> {
    return this.prisma.$transaction(async (tx) => {
      const container = await lockContainer(tx, containerId);
      assertPlannable(container);

      const leg = await requireLeg(tx, containerId, id);
      assertNotVisited(leg);

      if (dto.sequence !== undefined && dto.sequence !== leg.sequence) {
        await assertNotBeforeVisitedStop(tx, containerId, dto.sequence);
      }

      return tx.transitLeg.update({ where: { id }, data: dto });
    });
  }

  async recordArrival(
    containerId: string,
    id: string,
    dto: RecordLegEventDto,
  ): Promise<TransitLeg> {
    return this.prisma.$transaction(async (tx) => {
      const container = await lockContainer(tx, containerId);

      if (container.status !== ContainerStatus.DEPARTED) {
        throw new UnprocessableEntityException(
          `A transit stop can only be reached by a container at sea. ${container.containerRef} is ${container.status}`,
        );
      }

      const leg = await requireLeg(tx, containerId, id);

      if (leg.arrivedAt) {
        throw new UnprocessableEntityException(
          `Arrival at ${leg.port} was already recorded`,
        );
      }

      const at = dto.at ? new Date(dto.at) : new Date();

      const previous = await tx.transitLeg.findFirst({
        where: { containerId, sequence: { lt: leg.sequence } },
        orderBy: { sequence: 'desc' },
      });

      if (previous && !previous.departedAt) {
        throw new UnprocessableEntityException(
          `The container has not yet left stop #${previous.sequence} (${previous.port})`,
        );
      }

      // Left origin (or the previous stop) before getting here.
      const leftLastPortAt = previous?.departedAt ?? container.departedAt;

      if (leftLastPortAt && at < leftLastPortAt) {
        throw new BadRequestException(
          `Arrival at ${leg.port} cannot be earlier than departure from the previous port (${leftLastPortAt.toISOString()})`,
        );
      }

      return tx.transitLeg.update({ where: { id }, data: { arrivedAt: at } });
    });
  }

  async recordDeparture(
    containerId: string,
    id: string,
    dto: RecordLegEventDto,
  ): Promise<TransitLeg> {
    return this.prisma.$transaction(async (tx) => {
      await lockContainer(tx, containerId);

      const leg = await requireLeg(tx, containerId, id);

      if (!leg.arrivedAt) {
        throw new UnprocessableEntityException(
          `The container cannot leave ${leg.port} before arriving there`,
        );
      }

      if (leg.departedAt) {
        throw new UnprocessableEntityException(
          `Departure from ${leg.port} was already recorded`,
        );
      }

      const at = dto.at ? new Date(dto.at) : new Date();

      if (at < leg.arrivedAt) {
        throw new BadRequestException(
          `Departure from ${leg.port} cannot be earlier than arrival there (${leg.arrivedAt.toISOString()})`,
        );
      }

      return tx.transitLeg.update({ where: { id }, data: { departedAt: at } });
    });
  }

  /** A stop that was never made can be dropped; one that was is history. */
  async remove(containerId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const container = await lockContainer(tx, containerId);
      assertPlannable(container);

      const leg = await requireLeg(tx, containerId, id);
      assertNotVisited(leg);

      await tx.transitLeg.delete({ where: { id } });
    });
  }
}

function assertTransitRoute(container: Container): void {
  if (container.routeType !== RouteType.TRANSIT) {
    throw new UnprocessableEntityException(
      `Container ${container.containerRef} is on a ${container.routeType} route. Switch it to TRANSIT before planning stops`,
    );
  }
}

function assertPlannable(container: Container): void {
  if (!PLANNABLE_STATUSES.includes(container.status)) {
    throw new UnprocessableEntityException(
      `Transit legs are fixed once the container has ${container.status === ContainerStatus.CLOSED ? 'closed' : 'arrived'}. ${container.containerRef} is ${container.status}`,
    );
  }
}

function assertNotVisited(leg: TransitLeg): void {
  if (leg.arrivedAt) {
    throw new UnprocessableEntityException(
      `The container has already called at ${leg.port} — a visited stop cannot be changed`,
    );
  }
}

/** New stops go after the voyage so far, never into its past. */
async function assertNotBeforeVisitedStop(
  tx: Prisma.TransactionClient,
  containerId: string,
  sequence: number,
): Promise<void> {
  const laterVisited = await tx.transitLeg.findFirst({
    where: {
      containerId,
      sequence: { gte: sequence },
      arrivedAt: { not: null },
    },
    select: { sequence: true, port: true },
  });

  if (laterVisited) {
    throw new UnprocessableEntityException(
      `Stop #${sequence} would come before #${laterVisited.sequence} (${laterVisited.port}), which the container has already reached`,
    );
  }
}

async function requireLeg(
  tx: Prisma.TransactionClient,
  containerId: string,
  id: string,
): Promise<TransitLeg> {
  const leg = await tx.transitLeg.findFirst({ where: { id, containerId } });

  if (!leg) {
    throw new NotFoundException(
      `Transit leg ${id} not found on container ${containerId}`,
    );
  }

  return leg;
}
