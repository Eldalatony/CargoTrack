import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Container,
  ContainerStatus,
  EntityType,
  OrderStatus,
  Prisma,
  RouteType,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { containerStateMachine } from '../../common/state-machines/container.state-machine';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { StatusHistoryService } from '../status-history/status-history.service';
import {
  EMPTY_LOAD,
  Load,
  allocatedLoad,
  assertFits,
  sumLoads,
} from './container-capacity';
import { lockContainer } from './container-lock';
import { ChangeContainerStatusDto } from './dto/change-container-status.dto';
import { CreateContainerDto } from './dto/create-container.dto';
import { QueryContainersDto } from './dto/query-containers.dto';
import { UpdateContainerDto } from './dto/update-container.dto';

const DETAIL_INCLUDE = {
  freightProvider: { select: { id: true, name: true, country: true } },
  customsAgent: { select: { id: true, name: true, country: true } },
  allocations: {
    include: {
      order: {
        select: {
          id: true,
          status: true,
          client: { select: { id: true, companyName: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
  transitLegs: { orderBy: { sequence: 'asc' } },
} satisfies Prisma.ContainerInclude;

/** Fields that describe the booking itself — frozen once the booking is. */
const CAPACITY_FIELDS = ['capacityCbm', 'capacityWeightKg'] as const;

/** Fields that describe the box and its route — frozen once it sails. */
const PRE_DEPARTURE_FIELDS = [
  'containerRef',
  'containerType',
  'routeType',
  'originPort',
  'destinationPort',
] as const;

const PRE_DEPARTURE_STATUSES: readonly ContainerStatus[] = [
  ContainerStatus.OPEN_FOR_ALLOCATION,
  ContainerStatus.FULLY_ALLOCATED,
];

export interface Utilization {
  allocatedCbm: Prisma.Decimal;
  allocatedWeightKg: Prisma.Decimal;
  remainingCbm: Prisma.Decimal;
  remainingWeightKg: Prisma.Decimal;
  /** 0–100, one decimal place. What the dashboard's fill bar draws. */
  cbmPercent: number;
  weightPercent: number;
}

@Injectable()
export class ContainersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statusHistory: StatusHistoryService,
  ) {}

  async create(dto: CreateContainerDto, user: AuthenticatedUser) {
    await this.assertPartiesExist(dto.freightProviderId, dto.customsAgentId);

    return this.prisma.$transaction(async (tx) => {
      const container = await tx.container.create({
        data: {
          containerRef: dto.containerRef,
          containerType: dto.containerType,
          capacityCbm: new Prisma.Decimal(dto.capacityCbm),
          capacityWeightKg: new Prisma.Decimal(dto.capacityWeightKg),
          pricingBasis: dto.pricingBasis,
          bookingCost:
            dto.bookingCost === undefined
              ? null
              : new Prisma.Decimal(dto.bookingCost),
          currency: dto.currency ?? null,
          originPort: dto.originPort,
          destinationPort: dto.destinationPort,
          routeType: dto.routeType,
          insuranceRef: dto.insuranceRef ?? null,
          freightProviderId: dto.freightProviderId ?? null,
          customsAgentId: dto.customsAgentId ?? null,
        },
        include: DETAIL_INCLUDE,
      });

      await this.statusHistory.record(tx, {
        entityType: EntityType.CONTAINER,
        entityId: container.id,
        fromStatus: null,
        toStatus: container.status,
        changedBy: user.id,
        reason: 'Container opened for allocation',
      });

      return withUtilization(container);
    });
  }

  async findAll(query: QueryContainersDto) {
    const where: Prisma.ContainerWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.freightProviderId
        ? { freightProviderId: query.freightProviderId }
        : {}),
      ...(query.search
        ? { containerRef: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };

    const [containers, total] = await this.prisma.$transaction([
      this.prisma.container.findMany({
        where,
        include: {
          freightProvider: { select: { id: true, name: true } },
          _count: { select: { allocations: true, transitLegs: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.container.count({ where }),
    ]);

    // One grouped query for the page rather than one per row.
    const sums = await this.prisma.containerAllocation.groupBy({
      by: ['containerId'],
      where: { containerId: { in: containers.map((c) => c.id) } },
      _sum: { allocatedCbm: true, allocatedWeightKg: true },
    });

    const loadById = new Map<string, Load>(
      sums.map((row) => [
        row.containerId,
        {
          cbm: row._sum.allocatedCbm ?? EMPTY_LOAD.cbm,
          weightKg: row._sum.allocatedWeightKg ?? EMPTY_LOAD.weightKg,
        },
      ]),
    );

    const data = containers.map((container) => ({
      ...container,
      utilization: utilization(
        container,
        loadById.get(container.id) ?? EMPTY_LOAD,
      ),
    }));

    return paginate(data, total, query);
  }

  async findOne(id: string) {
    const container = await this.prisma.container.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });

    if (!container) {
      throw new NotFoundException(`Container ${id} not found`);
    }

    return withUtilization(container);
  }

  async update(id: string, dto: UpdateContainerDto) {
    await this.assertPartiesExist(dto.freightProviderId, dto.customsAgentId);

    return this.prisma.$transaction(async (tx) => {
      const container = await lockContainer(tx, id);

      if (container.status === ContainerStatus.CLOSED) {
        throw new UnprocessableEntityException(
          `Container ${container.containerRef} is CLOSED and can no longer be edited`,
        );
      }

      const touching = (fields: readonly (keyof UpdateContainerDto)[]) =>
        fields.filter((field) => dto[field] !== undefined);

      const capacityChanges = touching(CAPACITY_FIELDS);
      if (
        capacityChanges.length > 0 &&
        container.status !== ContainerStatus.OPEN_FOR_ALLOCATION
      ) {
        throw new UnprocessableEntityException(
          `Capacity is fixed once the booking is locked. Container ${container.containerRef} is ${container.status}`,
        );
      }

      const routeChanges = touching(PRE_DEPARTURE_FIELDS);
      if (
        routeChanges.length > 0 &&
        !PRE_DEPARTURE_STATUSES.includes(container.status)
      ) {
        throw new UnprocessableEntityException(
          `${routeChanges.join(', ')} cannot change after departure. Container ${container.containerRef} is ${container.status}`,
        );
      }

      if (capacityChanges.length > 0) {
        // Shrinking the box below what is already in it would turn every
        // existing allocation into an overbooking after the fact.
        assertFits(
          {
            cbm: new Prisma.Decimal(dto.capacityCbm ?? container.capacityCbm),
            weightKg: new Prisma.Decimal(
              dto.capacityWeightKg ?? container.capacityWeightKg,
            ),
          },
          await allocatedLoad(tx, id),
          EMPTY_LOAD,
        );
      }

      if (
        dto.routeType === RouteType.DIRECT &&
        container.routeType === RouteType.TRANSIT
      ) {
        const legs = await tx.transitLeg.count({ where: { containerId: id } });

        if (legs > 0) {
          throw new UnprocessableEntityException(
            `Container ${container.containerRef} has ${legs} transit leg(s). Remove them before switching it to a direct route`,
          );
        }
      }

      const bookingCost =
        dto.bookingCost === undefined
          ? container.bookingCost
          : new Prisma.Decimal(dto.bookingCost);

      if (bookingCost !== null && !(dto.currency ?? container.currency)) {
        throw new BadRequestException(
          'currency is required when a booking cost is set',
        );
      }

      const updated = await tx.container.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.capacityCbm === undefined
            ? {}
            : { capacityCbm: new Prisma.Decimal(dto.capacityCbm) }),
          ...(dto.capacityWeightKg === undefined
            ? {}
            : { capacityWeightKg: new Prisma.Decimal(dto.capacityWeightKg) }),
          ...(dto.bookingCost === undefined ? {} : { bookingCost }),
        },
        include: DETAIL_INCLUDE,
      });

      return withUtilization(updated);
    });
  }

  /**
   * Same door as orders: the transition table approves the move, the
   * preconditions for the target are checked, and status plus history are
   * written together.
   *
   * Unlike orders this runs under a row lock rather than a compare-and-swap,
   * because the preconditions read the container's children (allocations,
   * legs), and those must not change between the check and the write.
   */
  async changeStatus(
    id: string,
    dto: ChangeContainerStatusDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const container = await lockContainer(tx, id);

      containerStateMachine.assert(container.status, dto.status);
      await this.assertPreconditionsFor(tx, container, dto.status);

      const now = new Date();

      await tx.container.update({
        where: { id },
        data: {
          status: dto.status,
          // Each timestamp means "the transition happened", so the transition
          // stamps it rather than trusting a value typed in beside it.
          ...(dto.status === ContainerStatus.FULLY_ALLOCATED
            ? { bookedAt: now }
            : {}),
          ...(dto.status === ContainerStatus.DEPARTED
            ? { departedAt: now }
            : {}),
          ...(dto.status === ContainerStatus.ARRIVED ? { arrivedAt: now } : {}),
        },
      });

      await this.statusHistory.record(tx, {
        entityType: EntityType.CONTAINER,
        entityId: id,
        fromStatus: container.status,
        toStatus: dto.status,
        changedBy: user.id,
        reason: dto.reason,
      });

      return withUtilization(
        await tx.container.findUniqueOrThrow({
          where: { id },
          include: DETAIL_INCLUDE,
        }),
      );
    });
  }

  async statusHistoryFor(id: string) {
    await this.findOne(id);

    return this.statusHistory.findForEntity(EntityType.CONTAINER, id);
  }

  /**
   * Only a container nobody has been put in yet. Once it carries orders it
   * is part of their shipping record, and the way out is through the
   * lifecycle, not around it.
   */
  async remove(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const container = await lockContainer(tx, id);

      if (container.status !== ContainerStatus.OPEN_FOR_ALLOCATION) {
        throw new UnprocessableEntityException(
          `Only a container still OPEN_FOR_ALLOCATION can be deleted. ${container.containerRef} is ${container.status}`,
        );
      }

      const allocations = await tx.containerAllocation.count({
        where: { containerId: id },
      });

      if (allocations > 0) {
        throw new UnprocessableEntityException(
          `Container ${container.containerRef} still carries ${allocations} allocation(s). Remove them first`,
        );
      }

      await tx.container.delete({ where: { id } });
    });
  }

  private async assertPreconditionsFor(
    tx: Prisma.TransactionClient,
    container: Container,
    to: ContainerStatus,
  ): Promise<void> {
    if (to === ContainerStatus.FULLY_ALLOCATED) {
      const allocations = await tx.containerAllocation.count({
        where: { containerId: container.id },
      });

      if (allocations === 0) {
        throw new UnprocessableEntityException(
          'An empty container cannot be booked — allocate at least one order first',
        );
      }
    }

    if (
      to === ContainerStatus.DEPARTED &&
      container.routeType === RouteType.TRANSIT
    ) {
      const legs = await tx.transitLeg.count({
        where: { containerId: container.id },
      });

      if (legs === 0) {
        throw new UnprocessableEntityException(
          'A container on a transit route needs at least one transit leg planned before it departs',
        );
      }
    }

    if (
      to === ContainerStatus.ARRIVED &&
      container.routeType === RouteType.TRANSIT
    ) {
      // The sub-flow rejoins before ARRIVED on the diagram: the box has to
      // have left its last stop before it can reach its destination.
      const unfinished = await tx.transitLeg.findMany({
        where: { containerId: container.id, departedAt: null },
        select: { sequence: true, port: true },
        orderBy: { sequence: 'asc' },
      });

      if (unfinished.length > 0) {
        throw new UnprocessableEntityException(
          `Transit legs not yet completed: ${unfinished
            .map((leg) => `#${leg.sequence} ${leg.port}`)
            .join(', ')}. Record arrival and departure at each stop first`,
        );
      }
    }

    if (to === ContainerStatus.CLOSED) {
      // Where the two lifecycles meet. Every order in the box closes out on
      // its own schedule — one client's payment can lag another's by weeks —
      // and the container waits in ARRIVED until the last of them does.
      const open = await tx.containerAllocation.findMany({
        where: {
          containerId: container.id,
          order: { status: { not: OrderStatus.CLOSED_OUT } },
        },
        select: { order: { select: { id: true, status: true } } },
      });

      if (open.length > 0) {
        throw new UnprocessableEntityException(
          `Container ${container.containerRef} cannot close until every allocated order is CLOSED_OUT. Still open: ${open
            .map(({ order }) => `${order.id} (${order.status})`)
            .join(', ')}`,
        );
      }
    }
  }

  private async assertPartiesExist(
    freightProviderId?: string,
    customsAgentId?: string,
  ): Promise<void> {
    if (freightProviderId) {
      const provider = await this.prisma.freightProvider.findUnique({
        where: { id: freightProviderId },
        select: { id: true },
      });

      if (!provider) {
        throw new BadRequestException(
          `Freight provider ${freightProviderId} does not exist`,
        );
      }
    }

    if (customsAgentId) {
      const agent = await this.prisma.customsAgent.findUnique({
        where: { id: customsAgentId },
        select: { id: true },
      });

      if (!agent) {
        throw new BadRequestException(
          `Customs agent ${customsAgentId} does not exist`,
        );
      }
    }
  }
}

function utilization(
  container: Pick<Container, 'capacityCbm' | 'capacityWeightKg'>,
  allocated: Load,
): Utilization {
  const percent = (used: Prisma.Decimal, limit: Prisma.Decimal) =>
    limit.isZero()
      ? 0
      : used.dividedBy(limit).times(100).toDecimalPlaces(1).toNumber();

  return {
    allocatedCbm: allocated.cbm,
    allocatedWeightKg: allocated.weightKg,
    remainingCbm: container.capacityCbm.minus(allocated.cbm),
    remainingWeightKg: container.capacityWeightKg.minus(allocated.weightKg),
    cbmPercent: percent(allocated.cbm, container.capacityCbm),
    weightPercent: percent(allocated.weightKg, container.capacityWeightKg),
  };
}

function withUtilization<
  T extends Container & {
    allocations: {
      allocatedCbm: Prisma.Decimal;
      allocatedWeightKg: Prisma.Decimal;
    }[];
  },
>(container: T): T & { utilization: Utilization } {
  const allocated = sumLoads(
    container.allocations.map((row) => ({
      cbm: row.allocatedCbm,
      weightKg: row.allocatedWeightKg,
    })),
  );

  return { ...container, utilization: utilization(container, allocated) };
}
