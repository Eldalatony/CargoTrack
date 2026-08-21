import { QcOutcome } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateQcInspectionDto {
  @IsUUID()
  productionOrderId!: string;

  @IsDateString()
  inspectedAt!: string;

  @IsEnum(QcOutcome)
  outcome!: QcOutcome;

  /** Mandatory when the outcome is REJECTED — enforced in the service. */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  rejectionNotes?: string;
}
