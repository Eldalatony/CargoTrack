import { OmitType, PartialType } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

import { CreateProductionOrderDto } from './create-production-order.dto';

/**
 * The parent order and the supplier are fixed once the batch is placed —
 * re-sourcing means a new production order, which is what the
 * FACTORY_CANNOT_FULFIL branch on the order is for.
 */
export class UpdateProductionOrderDto extends PartialType(
  OmitType(CreateProductionOrderDto, ['orderId', 'supplierId'] as const),
) {
  @IsOptional()
  @IsDateString()
  actualReceivedDate?: string;
}
