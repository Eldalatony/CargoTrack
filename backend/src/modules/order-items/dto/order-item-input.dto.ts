import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * One line on an order. Volume and weight are per unit, not per line — the
 * line total is derived (see orders/order-totals.ts), so the two can never
 * disagree.
 *
 * Decimal places match the schema exactly: unit_cbm is Decimal(10,4) and
 * unit_weight_kg is Decimal(12,3). Rejecting extra precision at the edge is
 * kinder than letting Postgres round it silently.
 */
export class OrderItemInputDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  unitCbm!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  unitWeightKg!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;
}
