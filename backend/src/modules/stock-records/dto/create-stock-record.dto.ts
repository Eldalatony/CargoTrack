import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsPositive,
  IsUUID,
} from 'class-validator';

export class CreateStockRecordDto {
  @IsUUID()
  warehouseId!: string;

  @IsUUID()
  orderItemId!: string;

  /** Units of the order line now sitting in this warehouse. */
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity!: number;

  /** Defaults to now; given when the goods arrived before anyone logged them. */
  @IsOptional()
  @IsDateString()
  receivedAt?: string;
}
