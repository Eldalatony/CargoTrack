import { EntityType, NotificationStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class QueryNotificationsDto extends PaginationQueryDto {
  /** DEAD_LETTER is the dashboard's failed-jobs view. */
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;

  @IsOptional()
  @IsEnum(EntityType)
  entityType?: EntityType;

  @IsOptional()
  @IsUUID()
  entityId?: string;
}
