import { OrderStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class QueryOrdersDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  /**
   * Honoured for an Office Manager. For a client principal it is ignored
   * rather than obeyed — see common/access/client-scope.ts.
   */
  @IsOptional()
  @IsUUID()
  clientId?: string;
}
