import { Module } from '@nestjs/common';

import { FreightProvidersController } from './freight-providers.controller';
import { FreightProvidersService } from './freight-providers.service';

@Module({
  controllers: [FreightProvidersController],
  providers: [FreightProvidersService],
  exports: [FreightProvidersService],
})
export class FreightProvidersModule {}
