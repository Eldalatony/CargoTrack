import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  Matches,
} from 'class-validator';

export class CreateProductionOrderDto {
  @IsUUID()
  orderId!: string;

  @IsUUID()
  supplierId!: string;

  /** What the office pays the factory — not what the client pays the office. */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  agreedCost!: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be a 3-letter ISO 4217 code, e.g. CNY',
  })
  currency!: string;

  @IsOptional()
  @IsDateString()
  expectedReadyDate?: string;
}
