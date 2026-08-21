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
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { OrderItemInputDto } from './dto/order-item-input.dto';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';
import { OrderItemsService } from './order-items.service';

/**
 * Nested under the order on purpose: an order item has no meaning apart from
 * its order, and routing it this way means every request already carries the
 * id the scoping check needs.
 */
@ApiTags('order-items')
@ApiBearerAuth()
@Controller('orders/:orderId/items')
export class OrderItemsController {
  constructor(private readonly items: OrderItemsService) {}

  @Post()
  @Roles(UserRole.OFFICE_MANAGER)
  @ApiOperation({ summary: 'Add a line; order totals roll forward with it' })
  create(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: OrderItemInputDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.items.create(orderId, dto, user);
  }

  @Get()
  findAll(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.items.findAll(orderId, user);
  }

  @Patch(':id')
  @Roles(UserRole.OFFICE_MANAGER)
  update(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.items.update(orderId, id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.OFFICE_MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.items.remove(orderId, id, user);
  }
}
