import { DocumentType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class QueryDocumentsDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsUUID()
  containerId?: string;

  @IsOptional()
  @IsEnum(DocumentType)
  docType?: DocumentType;

  /** Only the latest version of each chain. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  current?: boolean;
}
