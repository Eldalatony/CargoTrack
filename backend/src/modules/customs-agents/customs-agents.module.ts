import { Module } from '@nestjs/common';

import { CustomsAgentsController } from './customs-agents.controller';
import { CustomsAgentsService } from './customs-agents.service';

@Module({
  controllers: [CustomsAgentsController],
  providers: [CustomsAgentsService],
  exports: [CustomsAgentsService],
})
export class CustomsAgentsModule {}
