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
import { ContainersService } from './containers.service';
import { ChangeContainerStatusDto } from './dto/change-container-status.dto';
import { CreateContainerDto } from './dto/create-container.dto';
import { QueryContainersDto } from './dto/query-containers.dto';
import { UpdateContainerDto } from './dto/update-container.dto';

/**
 * Office Manager only. A consolidated container carries several clients'
 * orders, so the raw container record is itself cross-client data. The
 * client portal gets a scoped shipment view of its own orders in Phase 5,
 * not this endpoint.
 */
@ApiTags('containers')
@ApiBearerAuth()
@Roles(UserRole.OFFICE_MANAGER)
@Controller('containers')
export class ContainersController {
  constructor(private readonly containers: ContainersService) {}

  @Post()
  @ApiOperation({ summary: 'Open a container for allocation' })
  create(
    @Body() dto: CreateContainerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.containers.create(dto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'List containers with their CBM/weight utilization',
  })
  findAll(@Query() query: QueryContainersDto) {
    return this.containers.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.containers.findOne(id);
  }

  @Get(':id/status-history')
  @ApiOperation({
    summary: 'Every status change this container has been through',
  })
  statusHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.containers.statusHistoryFor(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Amend booking details (capacity only while open, route only before departure)',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContainerDto,
  ) {
    return this.containers.update(id, dto);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Advance the container to its next state' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The transition is not on the container state diagram, or a precondition (allocations, transit legs, orders closed out) is unmet',
  })
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeContainerStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.containers.changeStatus(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an open, empty container' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.containers.remove(id);
  }
}
