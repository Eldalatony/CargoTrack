import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Notification log (a client sees only their own client-visible messages)',
  })
  findAll(
    @Query() query: QueryNotificationsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notifications.findAll(query, user);
  }

  @Get('summary')
  @Roles(UserRole.OFFICE_MANAGER)
  @ApiOperation({ summary: 'Counts per delivery status, for the dashboard' })
  summary() {
    return this.notifications.summary();
  }

  @Post(':id/retry')
  @Roles(UserRole.OFFICE_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-queue a dead-lettered notification' })
  retry(@Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.retry(id);
  }
}
