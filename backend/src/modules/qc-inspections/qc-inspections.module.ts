import { Module } from '@nestjs/common';

import { QcInspectionsController } from './qc-inspections.controller';
import { QcInspectionsService } from './qc-inspections.service';

@Module({
  controllers: [QcInspectionsController],
  providers: [QcInspectionsService],
  exports: [QcInspectionsService],
})
export class QcInspectionsModule {}
