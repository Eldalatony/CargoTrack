import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFile as UploadedFileParam,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { MAX_UPLOAD_BYTES } from '../../common/storage/file-storage.service';
import type { UploadedFile } from '../../common/storage/file-storage.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { DocumentsService } from './documents.service';
import { QueryDocumentsDto } from './dto/query-documents.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';

@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @Roles(UserRole.OFFICE_MANAGER)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a document, or a new version of one (supersedesId)',
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  upload(
    @Body() dto: UploadDocumentDto,
    @UploadedFileParam() file: UploadedFile,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException('A file field is required');
    }

    return this.documents.upload(dto, file, user);
  }

  @Get()
  @ApiOperation({
    summary:
      'List documents. A client sees their own, with file_ref only once the balance has cleared',
  })
  findAll(
    @Query() query: QueryDocumentsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documents.findAll(query, user);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documents.findOne(id, user);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'Every version in this document chain' })
  versions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documents.versions(id, user);
  }

  @Get(':id/status-history')
  statusHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documents.statusHistoryFor(id, user);
  }

  @Get(':id/file')
  @ApiOperation({ summary: 'Download the file behind a document' })
  @ApiResponse({
    status: 403,
    description: 'The balance payment has not cleared; the file is withheld',
  })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const file = await this.documents.download(id, user);

    return new StreamableFile(file.stream, {
      type: file.contentType,
      disposition: `attachment; filename="${file.filename}"`,
    });
  }
}
