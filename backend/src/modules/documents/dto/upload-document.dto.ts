import { DocumentType } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

/**
 * Multipart companion fields for a document upload.
 *
 * A document belongs to an order, a container, or both. A new version names
 * the one it replaces in `supersedesId` and inherits its order, container and
 * type — a revised bill of lading is still a bill of lading for the same
 * shipment.
 */
export class UploadDocumentDto {
  @IsEnum(DocumentType)
  docType!: DocumentType;

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsUUID()
  containerId?: string;

  @IsOptional()
  @IsUUID()
  supersedesId?: string;
}
