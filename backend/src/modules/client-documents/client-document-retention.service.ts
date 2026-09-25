import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * Enforces `retention_expires_at` on CLIENT_DOCUMENTS.
 *
 * What it removes is the *reference*: the row that says "this client's
 * passport scan is at <file_ref>". The bytes in storage are deliberately left
 * alone. Retention here means the platform stops holding a live pointer to
 * sensitive material it no longer has a reason to use; the archived file is
 * governed by storage policy, not by this job — see FileStorageService.remove,
 * which this never calls.
 *
 * Runs daily from the worker's retention queue, and on demand from the
 * Office Manager endpoint. Both call the same method.
 */
@Injectable()
export class ClientDocumentRetentionService {
  private readonly logger = new Logger(ClientDocumentRetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async purgeExpired(now: Date = new Date()): Promise<{ purged: number }> {
    const { count } = await this.prisma.clientDocument.deleteMany({
      where: { retentionExpiresAt: { lte: now } },
    });

    this.logger.log(
      `Retention sweep: ${count} expired client document reference(s) removed; stored files left in place`,
    );

    return { purged: count };
  }
}
