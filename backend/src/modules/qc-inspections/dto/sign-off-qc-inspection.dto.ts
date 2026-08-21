import { IsDateString, IsOptional } from 'class-validator';

/**
 * The client signs the physical QC sheet in front of the office manager, who
 * records it here. Backdating to the moment of signature is allowed because
 * the paper is the source of truth; defaulting to now covers the common case.
 */
export class SignOffQcInspectionDto {
  @IsOptional()
  @IsDateString()
  signedOffAt?: string;
}
