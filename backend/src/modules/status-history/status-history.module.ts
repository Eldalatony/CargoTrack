import { Global, Module } from '@nestjs/common';

import { StatusHistoryController } from './status-history.controller';
import { StatusHistoryService } from './status-history.service';

/**
 * Global: every module that owns a status column writes here, and threading
 * the same provider through half a dozen imports adds nothing.
 */
@Global()
@Module({
  controllers: [StatusHistoryController],
  providers: [StatusHistoryService],
  exports: [StatusHistoryService],
})
export class StatusHistoryModule {}
