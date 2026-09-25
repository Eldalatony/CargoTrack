import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreateStockRecordDto } from './dto/create-stock-record.dto';
import { HoldStockDto } from './dto/hold-stock.dto';
import { QueryStockRecordsDto } from './dto/query-stock-records.dto';
import { StockTransitionDto } from './dto/stock-transition.dto';
import { StockRecordsService } from './stock-records.service';

/**
 * Status moves through the three verbs below and nowhere else — there is no
 * PATCH, for the same reason orders have no status field on theirs.
 */
@ApiTags('stock-records')
@ApiBearerAuth()
@Roles(UserRole.OFFICE_MANAGER)
@Controller('stock-records')
export class StockRecordsController {
  constructor(private readonly stock: StockRecordsService) {}

  @Post()
  @ApiOperation({ summary: 'Log goods received into a warehouse' })
  create(
    @Body() dto: CreateStockRecordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stock.create(dto, user);
  }

  @Get()
  findAll(@Query() query: QueryStockRecordsDto) {
    return this.stock.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.stock.findOne(id);
  }

  @Get(':id/status-history')
  statusHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.stock.statusHistoryFor(id);
  }

  @Post(':id/hold')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Put stock on hold, with a free-text reason' })
  hold(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HoldStockDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stock.hold(id, dto.holdReason, user);
  }

  @Post(':id/lift-hold')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lift a hold; the goods stay in the warehouse' })
  liftHold(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StockTransitionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stock.liftHold(id, dto.reason, user);
  }

  @Post(':id/release')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Release the goods out of the warehouse' })
  release(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StockTransitionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stock.release(id, dto.reason, user);
  }
}
