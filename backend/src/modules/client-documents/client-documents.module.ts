import { Module } from '@nestjs/common';

import { ClientDocumentRetentionController } from './client-document-retention.controller';
import { ClientDocumentRetentionService } from './client-document-retention.service';
import { ClientDocumentsController } from './client-documents.controller';
import { ClientDocumentsService } from './client-documents.service';

@Module({
  controllers: [ClientDocumentsController, ClientDocumentRetentionController],
  providers: [ClientDocumentsService, ClientDocumentRetentionService],
  exports: [ClientDocumentRetentionService],
})
export class ClientDocumentsModule {}
