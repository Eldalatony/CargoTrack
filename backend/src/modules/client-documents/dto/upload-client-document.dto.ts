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
   * When this reference must be purged. The worker's nightly retention sweep
   * removes it after this date; the stored file itself is kept.
   */
  @IsOptional()
  @IsDateString()
  retentionExpiresAt?: string;
}
