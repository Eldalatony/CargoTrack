import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { CreatePaymentDto } from './dto/create-payment.dto';
import { MarkPaidDto } from './dto/mark-paid.dto';
import { QueryPaymentsDto } from './dto/query-payments.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@ApiBearerAuth()
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('payments')
  @Roles(UserRole.OFFICE_MANAGER)
  @ApiOperation({
    summary: 'Raise an invoice (no paidAt) or record money received or paid',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'A balance invoice before QC sign-off, or client money that does not match the order',
  })
  create(
    @Body() dto: CreatePaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payments.create(dto, user);
  }

  @Get('payments')
  @ApiOperation({
    summary:
      'List payments (a client sees only money between them and the office)',
  })
  findAll(
    @Query() query: QueryPaymentsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payments.findAll(query, user);
  }

  @Get('payments/:id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payments.findOne(id, user);
  }

  @Post('payments/:id/paid')
  @Roles(UserRole.OFFICE_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Mark an invoice paid. A balance that makes the order whole releases its documents',
  })
  markPaid(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkPaidDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payments.markPaid(id, dto, user);
  }

  @Delete('payments/:id')
  @Roles(UserRole.OFFICE_MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Void an unpaid invoice raised in error' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payments.remove(id, user);
  }

  @Get('orders/:orderId/settlement')
  @ApiOperation({
    summary: 'Deposit required and received, balance due, paid in full',
  })
  settlement(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payments.settlementFor(orderId, user);
  }
}
