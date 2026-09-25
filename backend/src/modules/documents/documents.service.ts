import { extname } from 'node:path';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import type { ReadStream } from 'node:fs';

import { isClient, requireClientId } from '../../common/access/client-scope';
import { Paginated, paginate } from '../../common/dto/pagination.dto';
import {
  FileStorageService,
  UploadedFile,
} from '../../common/storage/file-storage.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import { lockOrder } from '../orders/order-lock';
import {
  Settlement,
  loadSettlement,
  loadSettlements,
} from '../payments/settlement';
import { StatusHistoryService } from '../status-history/status-history.service';
import {
  DocumentRow,
  DocumentView,
  mayHaveFile,
  presentDocument,
  releaseDecision,
} from './document-release-gate';
import { QueryDocumentsDto } from './dto/query-documents.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';

const FOLDER = 'documents';

/** Documents have no status column; these are the states their history tells. */
export const DOCUMENT_WITHHELD = 'WITHHELD';
export const DOCUMENT_RELEASED = 'RELEASED';

const ROW_INCLUDE = {
  supersededBy: { select: { id: true } },
} satisfies Prisma.DocumentInclude;

export interface DocumentDownload {
  stream: ReadStream;
  contentType: string;
  filename: string;
}

/**
 * Shipping documents and their version chains.
 *
 * Two rules shape everything here:
 *
 *   - Versions form a chain through `supersedes_id`, which is UNIQUE: a
 *     document can be superseded once, so two people revising the same bill
 *     of lading at once get one v2 and one 409, never a fork.
 *   - What a client may have is decided per request by the release gate
 *     (document-release-gate.ts), against the live payment ledger.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    private readonly statusHistory: StatusHistoryService,
  ) {}

  async upload(
    dto: UploadDocumentDto,
    file: UploadedFile,
    user: AuthenticatedUser,
  ): Promise<DocumentView> {
    const placement = await this.placementFor(dto);

    const fileRef = await this.storage.store(file, FOLDER);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Under the order lock, so a balance clearing in parallel either
        // happened before this read (and the document is released on arrival)
        // or happens after this commit (and releases it with the rest).
        let settlement: Settlement | null = null;

        if (placement.orderId) {
          await lockOrder(tx, placement.orderId);
          settlement = await loadSettlement(tx, placement.orderId);
        }

        const releasedNow = settlement?.paidInFull ?? false;

        const document = await tx.document.create({
          data: {
            orderId: placement.orderId,
            containerId: placement.containerId,
            docType: dto.docType,
            version: placement.version,
            supersedesId: placement.supersedesId,
            fileRef,
            preparedBy: user.id,
            releasedToClientAt: releasedNow ? new Date() : null,
          },
          include: ROW_INCLUDE,
        });

        await this.statusHistory.record(tx, {
          entityType: EntityType.DOCUMENT,
          entityId: document.id,
          fromStatus: null,
          toStatus: releasedNow ? DOCUMENT_RELEASED : DOCUMENT_WITHHELD,
          changedBy: user.id,
          reason: placement.supersedesId
            ? `${dto.docType} v${placement.version} supersedes ${placement.supersedesId}`
            : `${dto.docType} v1 uploaded`,
        });

        return presentDocument(document, user, settlement);
      });
    } catch (error) {
      // The row never landed, so neither should the bytes.
      await this.storage.remove(fileRef);
      throw error;
    }
  }

  async findAll(
    query: QueryDocumentsDto,
    user: AuthenticatedUser,
  ): Promise<Paginated<DocumentView>> {
    const where: Prisma.DocumentWhereInput = {
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...(query.containerId ? { containerId: query.containerId } : {}),
      ...(query.docType ? { docType: query.docType } : {}),
      ...(query.current ? { supersededBy: { is: null } } : {}),
      ...this.scope(user),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        include: ROW_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { version: 'desc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.document.count({ where }),
    ]);

    const settlements = await loadSettlements(
      this.prisma,
      rows.flatMap((row) => (row.orderId ? [row.orderId] : [])),
    );

    return paginate(
      rows.map((row) =>
        presentDocument(
          row,
          user,
          row.orderId ? settlements.get(row.orderId) : null,
        ),
      ),
      total,
      query,
    );
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<DocumentView> {
    const document = await this.requireVisible(id, user);

    return presentDocument(document, user, await this.settlementOf(document));
  }

  /** The whole chain this document belongs to, oldest version first. */
  async versions(id: string, user: AuthenticatedUser): Promise<DocumentView[]> {
    const document = await this.requireVisible(id, user);
    const chain: DocumentRow[] = [document];

    for (let back = document; back.supersedesId;) {
      back = await this.prisma.document.findUniqueOrThrow({
        where: { id: back.supersedesId },
        include: ROW_INCLUDE,
      });
      chain.unshift(back);
    }

    for (let next = document; next.supersededBy;) {
      next = await this.prisma.document.findUniqueOrThrow({
        where: { id: next.supersededBy.id },
        include: ROW_INCLUDE,
      });
      chain.push(next);
    }

    const settlement = await this.settlementOf(document);

    return chain.map((row) => presentDocument(row, user, settlement));
  }

  /**
   * The file itself. The same gate as every other read — this is the path a
   * client would try once the JSON stopped carrying file_ref, so it is the
   * one that most needs to ask.
   */
  async download(
    id: string,
    user: AuthenticatedUser,
  ): Promise<DocumentDownload> {
    const document = await this.requireVisible(id, user);
    const decision = releaseDecision(
      document,
      await this.settlementOf(document),
    );

    if (!mayHaveFile(user, decision)) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'documents_withheld',
        message: decision.withheldReason,
      });
    }

    const { stream, contentType } = this.storage.open(document.fileRef);

    return {
      stream,
      contentType,
      filename: `${document.docType.toLowerCase()}-v${document.version}${extname(document.fileRef)}`,
    };
  }

  /**
   * Stamps every withheld document on the order as released. Called by
   * PaymentsService, inside its transaction and under the order lock, the
   * moment the order is paid in full.
   */
  async releaseForOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
    user: AuthenticatedUser,
    reason: string,
  ): Promise<number> {
    const pending = await tx.document.findMany({
      where: { orderId, releasedToClientAt: null },
      select: { id: true },
    });

    if (pending.length === 0) {
      return 0;
    }

    await tx.document.updateMany({
      where: { id: { in: pending.map((doc) => doc.id) } },
      data: { releasedToClientAt: new Date() },
    });

    for (const { id } of pending) {
      await this.statusHistory.record(tx, {
        entityType: EntityType.DOCUMENT,
        entityId: id,
        fromStatus: DOCUMENT_WITHHELD,
        toStatus: DOCUMENT_RELEASED,
        changedBy: user.id,
        reason,
      });
    }

    return pending.length;
  }

  async statusHistoryFor(id: string, user: AuthenticatedUser) {
    await this.requireVisible(id, user);

    return this.statusHistory.findForEntity(EntityType.DOCUMENT, id);
  }

  /** Where the new document goes, and which version it is. */
  private async placementFor(dto: UploadDocumentDto): Promise<{
    orderId: string | null;
    containerId: string | null;
    supersedesId: string | null;
    version: number;
  }> {
    if (dto.supersedesId) {
      const previous = await this.prisma.document.findUnique({
        where: { id: dto.supersedesId },
        include: ROW_INCLUDE,
      });

      if (!previous) {
        throw new BadRequestException(
          `Document ${dto.supersedesId} does not exist`,
        );
      }

      if (previous.supersededBy) {
        throw new UnprocessableEntityException(
          `Document ${previous.id} (v${previous.version}) is already superseded by ${previous.supersededBy.id}. Supersede the latest version instead`,
        );
      }

      if (previous.docType !== dto.docType) {
        throw new UnprocessableEntityException(
          `A new version must keep the document type: ${previous.id} is ${previous.docType}, not ${dto.docType}`,
        );
      }

      const moved =
        (dto.orderId !== undefined && dto.orderId !== previous.orderId) ||
        (dto.containerId !== undefined &&
          dto.containerId !== previous.containerId);

      if (moved) {
        throw new UnprocessableEntityException(
          'A new version belongs to the same order and container as the one it supersedes',
        );
      }

      return {
        orderId: previous.orderId,
        containerId: previous.containerId,
        supersedesId: previous.id,
        version: previous.version + 1,
      };
    }

    if (!dto.orderId && !dto.containerId) {
      throw new BadRequestException(
        'A document must belong to an order, a container, or both',
      );
    }

    if (dto.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: dto.orderId },
        select: { id: true },
      });

      if (!order) {
        throw new BadRequestException(`Order ${dto.orderId} does not exist`);
      }
    }

    if (dto.containerId) {
      const container = await this.prisma.container.findUnique({
        where: { id: dto.containerId },
        select: { id: true },
      });

      if (!container) {
        throw new BadRequestException(
          `Container ${dto.containerId} does not exist`,
        );
      }
    }

    return {
      orderId: dto.orderId ?? null,
      containerId: dto.containerId ?? null,
      supersedesId: null,
      version: 1,
    };
  }

  /**
   * A client reaches documents only through an order of their own.
   * Container-level documents have no order and so never match — they cover
   * several clients' goods at once.
   */
  private scope(user: AuthenticatedUser): Prisma.DocumentWhereInput {
    return isClient(user) ? { order: { clientId: requireClientId(user) } } : {};
  }

  private async requireVisible(
    id: string,
    user: AuthenticatedUser,
  ): Promise<DocumentRow> {
    const document = await this.prisma.document.findFirst({
      where: { id, ...this.scope(user) },
      include: ROW_INCLUDE,
    });

    if (!document) {
      throw new NotFoundException(`Document ${id} not found`);
    }

    return document;
  }

  private settlementOf(
    document: Pick<DocumentRow, 'orderId'>,
  ): Promise<Settlement | null> {
    return document.orderId
      ? loadSettlement(this.prisma, document.orderId)
      : Promise.resolve(null);
  }
}
