import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ChangeProductionOrderStatusDto } from './dto/change-production-order-status.dto';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { QueryProductionOrdersDto } from './dto/query-production-orders.dto';
import { UpdateProductionOrderDto } from './dto/update-production-order.dto';
import { ProductionOrdersService } from './production-orders.service';

@ApiTags('production-orders')
@ApiBearerAuth()
@Controller('production-orders')
export class ProductionOrdersController {
  constructor(private readonly productionOrders: ProductionOrdersService) {}

  @Post()
  @Roles(UserRole.OFFICE_MANAGER)
  @ApiOperation({ summary: 'Place a batch with a supplier' })
  create(
    @Body() dto: CreateProductionOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productionOrders.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List production orders (scoped for clients)' })
  findAll(
    @Query() query: QueryProductionOrdersDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productionOrders.findAll(query, user);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productionOrders.findOne(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.OFFICE_MANAGER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductionOrderDto,
  ) {
    return this.productionOrders.update(id, dto);
  }

  @Post(':id/status')
  @Roles(UserRole.OFFICE_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move the batch along the factory lifecycle' })
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeProductionOrderStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productionOrders.changeStatus(id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.OFFICE_MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.productionOrders.remove(id);
  }
}
