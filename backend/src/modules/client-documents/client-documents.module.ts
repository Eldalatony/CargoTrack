import { Module } from '@nestjs/common';

import { ClientDocumentsController } from './client-documents.controller';
import { ClientDocumentsService } from './client-documents.service';

@Module({
  controllers: [ClientDocumentsController],
  providers: [ClientDocumentsService],
})
export class ClientDocumentsModule {}
