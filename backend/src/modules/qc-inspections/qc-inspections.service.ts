import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  ProductionOrderStatus,
  QcInspection,
  QcOutcome,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { Paginated, paginate } from '../../common/dto/pagination.dto';
import { isClient, requireClientId } from '../../common/access/client-scope';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreateQcInspectionDto } from './dto/create-qc-inspection.dto';
import { QueryQcInspectionsDto } from './dto/query-qc-inspections.dto';
import { SignOffQcInspectionDto } from './dto/sign-off-qc-inspection.dto';

/** Goods have to exist before anyone can inspect them. */
const INSPECTABLE_STATUSES: readonly ProductionOrderStatus[] = [
  ProductionOrderStatus.READY,
  ProductionOrderStatus.RECEIVED,
];

const DETAIL_INCLUDE = {
  productionOrder: {
    select: {
      id: true,
      orderId: true,
      status: true,
      supplier: { select: { id: true, name: true } },
    },
  },
  signedOffByUser: { select: { id: true, name: true, role: true } },
} satisfies Prisma.QcInspectionInclude;

/**
 * QC is the gate the whole order hangs on.
 *
 * `client_signed_off_at` is not a workflow nicety — it is the record that the
 * client stood in the warehouse and accepted the goods. Nothing downstream
 * may assume it: the balance invoice (Phase 4) and the shipment booking
 * (OrdersService) both ask this module before they proceed.
 */
@Injectable()
export class QcInspectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateQcInspectionDto): Promise<QcInspection> {
    if (dto.outcome === QcOutcome.REJECTED && !dto.rejectionNotes) {
      throw new BadRequestException(
        'rejectionNotes is required when the outcome is REJECTED',
      );
    }

    const productionOrder = await this.prisma.productionOrder.findUnique({
      where: { id: dto.productionOrderId },
      select: { id: true, status: true },
    });

    if (!productionOrder) {
      throw new BadRequestException(
        `Production order ${dto.productionOrderId} does not exist`,
      );
    }

    if (!INSPECTABLE_STATUSES.includes(productionOrder.status)) {
      throw new UnprocessableEntityException(
        `Production order ${dto.productionOrderId} is ${productionOrder.status}; there is nothing to inspect until it is READY`,
      );
    }

    return this.prisma.qcInspection.create({
      data: {
        productionOrderId: dto.productionOrderId,
        inspectedAt: new Date(dto.inspectedAt),
        outcome: dto.outcome,
        rejectionNotes: dto.rejectionNotes ?? null,
      },
      include: DETAIL_INCLUDE,
    });
  }

  async findAll(
    query: QueryQcInspectionsDto,
    user: AuthenticatedUser,
  ): Promise<Paginated<QcInspection>> {
    const where: Prisma.QcInspectionWhereInput = {
      ...(query.productionOrderId
        ? { productionOrderId: query.productionOrderId }
        : {}),
      ...(query.outcome ? { outcome: query.outcome } : {}),
      ...(query.signedOff === undefined
        ? {}
        : {
            clientSignedOffAt: query.signedOff ? { not: null } : null,
          }),
      ...this.productionOrderFilter(query.orderId, user),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.qcInspection.findMany({
        where,
        include: DETAIL_INCLUDE,
        orderBy: { inspectedAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.qcInspection.count({ where }),
    ]);

    return paginate(data, total, query);
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<QcInspection> {
    const inspection = await this.prisma.qcInspection.findFirst({
      where: { id, ...this.productionOrderFilter(undefined, user) },
      include: DETAIL_INCLUDE,
    });

    if (!inspection) {
      throw new NotFoundException(`QC inspection ${id} not found`);
    }

    return inspection;
  }

  /**
   * Records the client's signature. Two guards, both of them the point of the
   * feature: a rejected batch cannot be signed off, and a signature cannot be
   * quietly overwritten once it exists.
   */
  async signOff(
    id: string,
    dto: SignOffQcInspectionDto,
    user: AuthenticatedUser,
  ): Promise<QcInspection> {
    const inspection = await this.requireInspection(id);

    if (inspection.outcome === QcOutcome.REJECTED) {
      throw new UnprocessableEntityException(
        'A rejected QC inspection cannot be signed off. Re-inspect the batch and record a new inspection',
      );
    }

    if (inspection.clientSignedOffAt) {
      throw new ConflictException(
        `QC inspection ${id} was already signed off at ${inspection.clientSignedOffAt.toISOString()}`,
      );
    }

    return this.prisma.qcInspection.update({
      where: { id },
      data: {
        clientSignedOffAt: dto.signedOffAt
          ? new Date(dto.signedOffAt)
          : new Date(),
        // Who attested to the signature — the manager who witnessed the
        // client sign the sheet.
        signedOffBy: user.id,
      },
      include: DETAIL_INCLUDE,
    });
  }

  /** True when this order has a passed inspection the client has signed. */
  async isSignedOffForOrder(orderId: string): Promise<boolean> {
    const signedOff = await this.prisma.qcInspection.count({
      where: {
        productionOrder: { orderId },
        clientSignedOffAt: { not: null },
        outcome: { in: [QcOutcome.PASSED, QcOutcome.PARTIAL] },
      },
    });

    return signedOff > 0;
  }

  private productionOrderFilter(
    orderId: string | undefined,
    user: AuthenticatedUser,
  ): Prisma.QcInspectionWhereInput {
    const productionOrder: Prisma.ProductionOrderWhereInput = {
      ...(orderId ? { orderId } : {}),
      ...(isClient(user) ? { order: { clientId: requireClientId(user) } } : {}),
    };

    return Object.keys(productionOrder).length > 0 ? { productionOrder } : {};
  }

  private async requireInspection(id: string): Promise<QcInspection> {
    const inspection = await this.prisma.qcInspection.findUnique({
      where: { id },
    });

    if (!inspection) {
      throw new NotFoundException(`QC inspection ${id} not found`);
    }

    return inspection;
  }
}
