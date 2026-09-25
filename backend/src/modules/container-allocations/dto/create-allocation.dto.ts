import { Transform, Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  Matches,
  ValidateIf,
} from 'class-validator';

export class CreateAllocationDto {
  @IsUUID()
  orderId!: string;

  /**
   * Defaults to the order's total_cbm. Given explicitly when an order is
   * split across containers, so each box carries only its share.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  allocatedCbm?: number;

  /** Defaults to the order's total_weight_kg, as above. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  allocatedWeightKg?: number;

  /** This order's share of the booking cost, if it is being recharged. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  allocatedCost?: number;

  @ValidateIf((dto: CreateAllocationDto) => dto.allocatedCost !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be a 3-letter ISO 4217 code, e.g. USD',
  })
  currency?: string;
}
