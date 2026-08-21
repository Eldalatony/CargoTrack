import { ProductionOrderStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ChangeProductionOrderStatusDto {
  @IsEnum(ProductionOrderStatus)
  status!: ProductionOrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
