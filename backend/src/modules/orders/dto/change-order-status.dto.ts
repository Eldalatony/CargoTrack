import { OrderStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ChangeOrderStatusDto {
  @IsEnum(OrderStatus, {
    message: `status must be one of: ${Object.values(OrderStatus).join(', ')}`,
  })
  status!: OrderStatus;

  /**
   * Why the order moved. Optional on the happy path, where the transition
   * speaks for itself, and genuinely useful on the exception branches —
   * "balance not received within terms" is the whole story of a withheld
   * document set.
   */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
