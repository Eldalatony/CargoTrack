import { OrderStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * The deposit taken when the order is confirmed. Currency, direction and
 * counterparty are not asked for: a deposit is the order's own client paying
 * in the order's own currency, and anything else is not a deposit.
 */
export class ConfirmationDepositDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  /** When the money arrived. Defaults to now. */
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  /** Bank transfer reference or receipt number. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;
}

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

  /**
   * Only with status ORDER_CONFIRMED: records the deposit in the same
   * transaction as the confirmation. The deposit can also be recorded
   * separately through POST /payments; either way, GOODS_RECEIVED waits for it.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => ConfirmationDepositDto)
  deposit?: ConfirmationDepositDto;
}
