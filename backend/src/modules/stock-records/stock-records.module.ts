import { Module } from '@nestjs/common';

import { StockRecordsController } from './stock-records.controller';
import { StockRecordsService } from './stock-records.service';

@Module({
  controllers: [StockRecordsController],
  providers: [StockRecordsService],
})
export class StockRecordsModule {}
