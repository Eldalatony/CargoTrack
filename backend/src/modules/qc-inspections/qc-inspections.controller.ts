import {
  Body,
  Controller,
  Get,
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
import { CreateQcInspectionDto } from './dto/create-qc-inspection.dto';
import { QueryQcInspectionsDto } from './dto/query-qc-inspections.dto';
import { SignOffQcInspectionDto } from './dto/sign-off-qc-inspection.dto';
import { QcInspectionsService } from './qc-inspections.service';

@ApiTags('qc-inspections')
@ApiBearerAuth()
@Controller('qc-inspections')
export class QcInspectionsController {
  constructor(private readonly inspections: QcInspectionsService) {}

  @Post()
  @Roles(UserRole.OFFICE_MANAGER)
  @ApiOperation({ summary: 'Record a QC inspection against a batch' })
  create(@Body() dto: CreateQcInspectionDto) {
    return this.inspections.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List inspections; filter signedOff=false for the pending queue',
  })
  findAll(
    @Query() query: QueryQcInspectionsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inspections.findAll(query, user);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inspections.findOne(id, user);
  }

  /**
   * The hard rule made operable: until this endpoint has been called for an
   * order, that order cannot be booked for shipment and (from Phase 4) cannot
   * be invoiced for its balance.
   */
  @Patch(':id/sign-off')
  @Roles(UserRole.OFFICE_MANAGER)
  @ApiOperation({ summary: 'Record the client signing the QC sheet' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The inspection was rejected and cannot be signed off',
  })
  signOff(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SignOffQcInspectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inspections.signOff(id, dto, user);
  }
}
