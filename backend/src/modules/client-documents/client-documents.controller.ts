import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile as UploadedFileParam,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { MAX_UPLOAD_BYTES } from '../../common/storage/file-storage.service';
import type { UploadedFile } from '../../common/storage/file-storage.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ClientDocumentsService } from './client-documents.service';
import { UploadClientDocumentDto } from './dto/upload-client-document.dto';

@ApiTags('client-documents')
@ApiBearerAuth()
@Controller('clients/:clientId/documents')
export class ClientDocumentsController {
  constructor(private readonly documents: ClientDocumentsService) {}

  @Post()
  @Roles(UserRole.OFFICE_MANAGER)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a passport scan or other client document' })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  upload(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: UploadClientDocumentDto,
    @UploadedFileParam() file: UploadedFile,
  ) {
    if (!file) {
      throw new BadRequestException('A file field is required');
    }

    return this.documents.upload(clientId, dto, file);
  }

  @Get()
  @ApiOperation({ summary: 'List a client documents (references withheld)' })
  findAll(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documents.findAllForClient(clientId, user);
  }

  @Delete(':id')
  @Roles(UserRole.OFFICE_MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documents.remove(clientId, id);
  }
}
