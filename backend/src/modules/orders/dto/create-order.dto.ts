import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { OrderItemInputDto } from '../../order-items/dto/order-item-input.dto';

/**
 * The office takes roughly a fifth up front before the factory starts. It is
 * a negotiated figure rather than a constant, so the rule is a band around
 * 20% rather than an equality check — but a 5% or a 60% "deposit" is a
 * mistake, and this is where it gets caught.
 */
export const DEPOSIT_PERCENTAGE_DEFAULT = 20;
export const DEPOSIT_PERCENTAGE_MIN = 15;
export const DEPOSIT_PERCENTAGE_MAX = 25;

export class CreateOrderDto {
  @IsUUID()
  clientId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  agreedPrice!: number;

  /** ISO 4217. Every money column in the schema carries its own currency. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be a 3-letter ISO 4217 code, e.g. USD',
  })
  currency!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(DEPOSIT_PERCENTAGE_MIN)
  @Max(DEPOSIT_PERCENTAGE_MAX)
  depositPercentage?: number;

  @IsOptional()
  @IsDateString()
  requiredBy?: string;

  /** Lines may be supplied here or added afterwards; totals roll up either way. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items?: OrderItemInputDto[];
}
