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
import { CustomsAgentsService } from './customs-agents.service';
import { CreateCustomsAgentDto } from './dto/create-customs-agent.dto';
import { QueryCustomsAgentsDto } from './dto/query-customs-agents.dto';
import { UpdateCustomsAgentDto } from './dto/update-customs-agent.dto';

@ApiTags('customs-agents')
@ApiBearerAuth()
@Roles(UserRole.OFFICE_MANAGER)
@Controller('customs-agents')
export class CustomsAgentsController {
  constructor(private readonly agents: CustomsAgentsService) {}

  @Post()
  @ApiOperation({ summary: 'Register a customs agent' })
  create(@Body() dto: CreateCustomsAgentDto) {
    return this.agents.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryCustomsAgentsDto) {
    return this.agents.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.agents.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomsAgentDto,
  ) {
    return this.agents.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.agents.remove(id);
  }
}
