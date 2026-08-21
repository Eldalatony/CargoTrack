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

import { Roles } from '../../common/decorators/roles.decorator';
import { CreateFreightProviderDto } from './dto/create-freight-provider.dto';
import { QueryFreightProvidersDto } from './dto/query-freight-providers.dto';
import { UpdateFreightProviderDto } from './dto/update-freight-provider.dto';
import { FreightProvidersService } from './freight-providers.service';

@ApiTags('freight-providers')
@ApiBearerAuth()
@Roles(UserRole.OFFICE_MANAGER)
@Controller('freight-providers')
export class FreightProvidersController {
  constructor(private readonly providers: FreightProvidersService) {}

  @Post()
  @ApiOperation({ summary: 'Register a freight provider' })
  create(@Body() dto: CreateFreightProviderDto) {
    return this.providers.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryFreightProvidersDto) {
    return this.providers.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.providers.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFreightProviderDto,
  ) {
    return this.providers.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.providers.remove(id);
  }
}
