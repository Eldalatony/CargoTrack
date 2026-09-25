import { Injectable, NotFoundException } from '@nestjs/common';
import { ClientDocument } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import {
  FileStorageService,
  UploadedFile,
} from '../../common/storage/file-storage.service';
import { isClient, requireClientId } from '../../common/access/client-scope';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { UploadClientDocumentDto } from './dto/upload-client-document.dto';

const FOLDER = 'client-documents';

/**
 * Everything a caller may see about a client document. `file_ref` is omitted
 * at the query, not filtered out afterwards, so no read path can leak it by
 * forgetting to strip it.
 */
const HIDE_FILE_REF = { fileRef: true } as const;

export type ClientDocumentSummary = Omit<ClientDocument, 'fileRef'>;

/**
 * Passport scans and the like. Two rules shape this module:
 *
 *   - The database stores a reference, never bytes. `file_ref` points into the
 *     storage volume locally and at an object storage key in production.
 *   - That reference is not part of any response. Knowing a client has a
 *     passport on file is unremarkable; handing out the pointer to it is not.
 *
 * Past its `retention_expires_at` a reference is treated as gone even before
 * the nightly sweep deletes it (ClientDocumentRetentionService), so the
 * answer never depends on when the job last ran.
 */
@Injectable()
export class ClientDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
  ) {}

  async upload(
    clientId: string,
    dto: UploadClientDocumentDto,
    file: UploadedFile,
  ): Promise<ClientDocumentSummary> {
    await this.assertClientExists(clientId);

    const fileRef = await this.storage.store(file, FOLDER);

    return this.prisma.clientDocument.create({
      data: {
        clientId,
        docType: dto.docType,
        fileRef,
        retentionExpiresAt: dto.retentionExpiresAt
          ? new Date(dto.retentionExpiresAt)
          : null,
      },
      omit: HIDE_FILE_REF,
    });
  }

  async findAllForClient(
    clientId: string,
    user: AuthenticatedUser,
  ): Promise<ClientDocumentSummary[]> {
    if (isClient(user) && requireClientId(user) !== clientId) {
      throw new NotFoundException(`Client ${clientId} not found`);
    }

    await this.assertClientExists(clientId);

    return this.prisma.clientDocument.findMany({
      where: {
        clientId,
        OR: [
          { retentionExpiresAt: null },
          { retentionExpiresAt: { gt: new Date() } },
        ],
      },
      orderBy: { uploadedAt: 'desc' },
      omit: HIDE_FILE_REF,
    });
  }

  /** The one place the reference is read — to delete the bytes behind it. */
  async remove(clientId: string, id: string): Promise<void> {
    const document = await this.prisma.clientDocument.findFirst({
      where: { id, clientId },
    });

    if (!document) {
      throw new NotFoundException(`Client document ${id} not found`);
    }

    await this.prisma.clientDocument.delete({ where: { id } });
    await this.storage.remove(document.fileRef);
  }

  private async assertClientExists(clientId: string): Promise<void> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true },
    });

    if (!client) {
      throw new NotFoundException(`Client ${clientId} not found`);
    }
  }
}
