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

import { Roles } from '../../common/decorators/roles.decorator';
import { CreateTransitLegDto } from './dto/create-transit-leg.dto';
import { RecordLegEventDto } from './dto/record-leg-event.dto';
import { UpdateTransitLegDto } from './dto/update-transit-leg.dto';
import { TransitLegsService } from './transit-legs.service';

@ApiTags('transit-legs')
@ApiBearerAuth()
@Roles(UserRole.OFFICE_MANAGER)
@Controller('containers/:containerId/transit-legs')
export class TransitLegsController {
  constructor(private readonly legs: TransitLegsService) {}

  @Post()
  @ApiOperation({ summary: 'Plan a transit stop (appended unless sequenced)' })
  create(
    @Param('containerId', ParseUUIDPipe) containerId: string,
    @Body() dto: CreateTransitLegDto,
  ) {
    return this.legs.create(containerId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'The voyage, stop by stop' })
  findAll(@Param('containerId', ParseUUIDPipe) containerId: string) {
    return this.legs.findAll(containerId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change a stop not yet reached' })
  update(
    @Param('containerId', ParseUUIDPipe) containerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransitLegDto,
  ) {
    return this.legs.update(containerId, id, dto);
  }

  @Post(':id/arrival')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record the container reaching this stop' })
  recordArrival(
    @Param('containerId', ParseUUIDPipe) containerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordLegEventDto,
  ) {
    return this.legs.recordArrival(containerId, id, dto);
  }

  @Post(':id/departure')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record the container leaving this stop' })
  recordDeparture(
    @Param('containerId', ParseUUIDPipe) containerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordLegEventDto,
  ) {
    return this.legs.recordDeparture(containerId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('containerId', ParseUUIDPipe) containerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.legs.remove(containerId, id);
  }
}
