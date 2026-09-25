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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Roles } from '../../common/decorators/roles.decorator';
import { ContainerAllocationsService } from './container-allocations.service';
import { CreateAllocationDto } from './dto/create-allocation.dto';
import { UpdateAllocationDto } from './dto/update-allocation.dto';

/** Nested under the container: the capacity guard is a property of the box. */
@ApiTags('container-allocations')
@ApiBearerAuth()
@Roles(UserRole.OFFICE_MANAGER)
@Controller('containers/:containerId/allocations')
export class ContainerAllocationsController {
  constructor(private readonly allocations: ContainerAllocationsService) {}

  @Post()
  @ApiOperation({
    summary: 'Put an order (or a share of one) in the container',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The allocation would exceed the container CBM or weight capacity, the container is no longer open, or the order is not ready to ship',
  })
  create(
    @Param('containerId', ParseUUIDPipe) containerId: string,
    @Body() dto: CreateAllocationDto,
  ) {
    return this.allocations.create(containerId, dto);
  }

  @Get()
  findAll(@Param('containerId', ParseUUIDPipe) containerId: string) {
    return this.allocations.findAll(containerId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Resize an allocation, re-checked against capacity',
  })
  update(
    @Param('containerId', ParseUUIDPipe) containerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAllocationDto,
  ) {
    return this.allocations.update(containerId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('containerId', ParseUUIDPipe) containerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.allocations.remove(containerId, id);
  }
}
