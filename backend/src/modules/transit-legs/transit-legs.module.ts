import { Module } from '@nestjs/common';

import { TransitLegsController } from './transit-legs.controller';
import { TransitLegsService } from './transit-legs.service';

@Module({
  controllers: [TransitLegsController],
  providers: [TransitLegsService],
})
export class TransitLegsModule {}
