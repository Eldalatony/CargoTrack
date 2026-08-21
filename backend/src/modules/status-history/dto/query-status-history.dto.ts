import { EntityType } from '@prisma/client';
import { IsEnum, IsUUID } from 'class-validator';

export class QueryStatusHistoryDto {
  @IsEnum(EntityType)
  entityType!: EntityType;

  @IsUUID()
  entityId!: string;
}
