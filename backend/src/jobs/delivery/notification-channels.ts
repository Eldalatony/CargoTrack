import { Injectable, Logger } from '@nestjs/common';
import {
  Notification,
  NotificationChannel,
  RecipientType,
} from '@prisma/client';
import { UnrecoverableError } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * The provider edge of the pipeline: email, SMS, WhatsApp, in-app.
 *
 * Still a stub — no provider account is wired up, so a "send" is a log line.
 * It is a stub with honest failure modes, though, because those are what the
 * retry and dead-letter bookkeeping around it exist for:
 *
 *   - A recipient that no longer exists, or has no address on the requested
 *     channel, throws UnrecoverableError. Retrying cannot fix it, so BullMQ
 *     skips the remaining attempts and the row goes straight to DEAD_LETTER.
 *   - An address under the reserved `.invalid` TLD (RFC 2606) can never be
 *     delivered to, and the stub bounces it the way a real provider would.
 *     That is a transient-looking failure, so it walks the whole retry path —
 *     which is how the Gate 4 script shows FAILED → DEAD_LETTER on the live
 *     stack without a switch that only exists for testing.
 */
@Injectable()
export class NotificationChannels {
  private readonly logger = new Logger(NotificationChannels.name);

  constructor(private readonly prisma: PrismaService) {}

  async deliver(notification: Notification): Promise<void> {
    if (notification.channel === NotificationChannel.IN_APP) {
      // The row is the message: the inbox reads NOTIFICATIONS directly.
      return;
    }

    const address = await this.addressOf(notification);

    if (!address) {
      throw new UnrecoverableError(
        `${notification.recipientType} ${notification.recipientId} has no ${notification.channel} address`,
      );
    }

    if (
      notification.channel === NotificationChannel.EMAIL &&
      /\.invalid$/i.test(address)
    ) {
      throw new Error(`Mailbox unreachable: ${address}`);
    }

    this.logger.log(
      `[stub ${notification.channel}] ${notification.eventType} -> ${address}`,
    );
  }

  private async addressOf(notification: Notification): Promise<string | null> {
    const email = notification.channel === NotificationChannel.EMAIL;
    const id = notification.recipientId;

    switch (notification.recipientType) {
      case RecipientType.CLIENT: {
        const client = await this.prisma.client.findUnique({
          where: { id },
          select: { email: true, phone: true },
        });
        return (email ? client?.email : client?.phone) ?? null;
      }

      case RecipientType.USER: {
        const user = await this.prisma.user.findUnique({
          where: { id },
          select: { email: true },
        });
        return email ? (user?.email ?? null) : null;
      }

      case RecipientType.SUPPLIER: {
        const supplier = await this.prisma.supplier.findUnique({
          where: { id },
          select: { contactPhone: true },
        });
        return email ? null : (supplier?.contactPhone ?? null);
      }

      case RecipientType.FREIGHT_PROVIDER: {
        const provider = await this.prisma.freightProvider.findUnique({
          where: { id },
          select: { contactPhone: true },
        });
        return email ? null : (provider?.contactPhone ?? null);
      }

      case RecipientType.CUSTOMS_AGENT: {
        const agent = await this.prisma.customsAgent.findUnique({
          where: { id },
          select: { phone: true },
        });
        return email ? null : (agent?.phone ?? null);
      }
    }
  }
}
