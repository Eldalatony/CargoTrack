import { OmitType, PartialType } from '@nestjs/swagger';

import { CreateAllocationDto } from './create-allocation.dto';

/** Moving an order to another container is a delete here and a create there. */
export class UpdateAllocationDto extends PartialType(
  OmitType(CreateAllocationDto, ['orderId'] as const),
) {}
