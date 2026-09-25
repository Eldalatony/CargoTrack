import { Module } from '@nestjs/common';

import { ContainerAllocationsController } from './container-allocations.controller';
import { ContainerAllocationsService } from './container-allocations.service';

@Module({
  controllers: [ContainerAllocationsController],
  providers: [ContainerAllocationsService],
})
export class ContainerAllocationsModule {}
