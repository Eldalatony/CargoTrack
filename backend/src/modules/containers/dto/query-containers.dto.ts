import { ContainerStatus } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class QueryContainersDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ContainerStatus)
  status?: ContainerStatus;

  @IsOptional()
  @IsUUID()
  freightProviderId?: string;

  /** Matches anywhere in the container reference. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  search?: string;
}
