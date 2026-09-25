import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../../common/decorators/roles.decorator';
import { ClientDocumentRetentionService } from './client-document-retention.service';

@ApiTags('client-documents')
@ApiBearerAuth()
@Roles(UserRole.OFFICE_MANAGER)
@Controller('client-documents/retention')
export class ClientDocumentRetentionController {
  constructor(private readonly retention: ClientDocumentRetentionService) {}

  /** The same sweep the worker runs nightly, for when waiting is not an option. */
  @Post('run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove expired client document references now (files are kept)',
  })
  run() {
    return this.retention.purgeExpired();
  }
}
