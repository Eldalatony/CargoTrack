import {
  CounterpartyType,
  PaymentDirection,
  PaymentType,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * Raises an invoice or records money that has already moved.
 *
 * Without `paidAt` the row is outstanding — an invoice raised, nothing
 * received. With it, the money has cleared. POST /payments/:id/paid turns the
 * first into the second.
 *
 * For client money (DEPOSIT, BALANCE, REFUND) direction and counterparty
 * follow from the type and the order and may be left out; when given they
 * must agree. For everything else they are required.
 */
export class CreatePaymentDto {
  @IsUUID()
  orderId!: string;

  @IsEnum(PaymentType)
  paymentType!: PaymentType;

  @IsOptional()
  @IsEnum(PaymentDirection)
  direction?: PaymentDirection;

  @IsOptional()
  @IsEnum(CounterpartyType)
  counterpartyType?: CounterpartyType;

  @IsOptional()
  @IsUUID()
  counterpartyId?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be a 3-letter ISO 4217 code, e.g. USD',
  })
  currency!: string;

  /** Units of the order currency per unit of this payment's currency. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  fxRate?: number;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;
}
