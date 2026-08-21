import { Controller, Get, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../../common/decorators/roles.decorator';
import { QueryStatusHistoryDto } from './dto/query-status-history.dto';
import { StatusHistoryService } from './status-history.service';

/**
 * The cross-entity view, for the Office Manager only. Clients read history
 * through their own order (GET /orders/:id/status-history), which is scoped.
 */
@ApiTags('status-history')
@ApiBearerAuth()
@Roles(UserRole.OFFICE_MANAGER)
@Controller('status-history')
export class StatusHistoryController {
  constructor(private readonly history: StatusHistoryService) {}

  @Get()
  @ApiOperation({ summary: 'Audit trail for any entity' })
  findForEntity(@Query() query: QueryStatusHistoryDto) {
    return this.history.findForEntity(query.entityType, query.entityId);
  }
}
