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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ChangeOrderStatusDto } from './dto/change-order-status.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @Roles(UserRole.OFFICE_MANAGER)
  @ApiOperation({ summary: 'Place an order, optionally with its line items' })
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.orders.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List orders (a client sees only their own)' })
  findAll(
    @Query() query: QueryOrdersDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orders.findAll(query, user);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orders.findOne(id, user);
  }

  @Get(':id/status-history')
  @ApiOperation({ summary: 'Every status change this order has been through' })
  statusHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orders.statusHistoryFor(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.OFFICE_MANAGER)
  @ApiOperation({ summary: 'Amend commercial terms (never status or client)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrderDto) {
    return this.orders.update(id, dto);
  }

  /**
   * Status is not a field on PATCH. It moves here or not at all, which is
   * what makes "status is enforced server-side" true rather than aspirational.
   */
  @Post(':id/status')
  @Roles(UserRole.OFFICE_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Advance the order to its next state' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The transition is not on the order state diagram, or a precondition for the target state is unmet',
  })
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeOrderStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orders.changeStatus(id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.OFFICE_MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a mistyped order still in ORDER_PLACED' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.remove(id);
  }
}
