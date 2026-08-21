import { ClientDocumentType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

/**
 * Multipart companion fields for the upload. The file itself is not described
 * here — it never reaches the database, only the storage volume.
 */
export class UploadClientDocumentDto {
  @IsEnum(ClientDocumentType)
  docType!: ClientDocumentType;

  /**
   * When this reference must be purged. Phase 4 runs the scheduled cleanup;
   * capturing the date at upload time is what makes that job possible.
   */
  @IsOptional()
  @IsDateString()
  retentionExpiresAt?: string;
}
