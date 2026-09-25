import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** The subset of a Multer upload this service needs. */
export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/**
 * Writes uploads to the storage volume and hands back a reference.
 *
 * Binary data never enters the database — the tables carry a file_ref string
 * and nothing else. Locally that resolves inside the file_storage Docker
 * volume; in production the same reference is an object storage key, which is
 * why callers only ever see the relative path.
 */
@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = config.getOrThrow<string>('FILE_STORAGE_PATH');
  }

  /**
   * @param folder logical bucket, e.g. client-documents
   * @returns the reference to persist, e.g. client-documents/<uuid>.pdf
   */
  async store(file: UploadedFile, folder: string): Promise<string> {
    this.validate(file);

    const extension = extname(file.originalname).toLowerCase().slice(0, 10);
    const fileRef = `${folder}/${randomUUID()}${extension}`;

    await mkdir(join(this.root, folder), { recursive: true });
    await writeFile(join(this.root, fileRef), file.buffer);

    this.logger.log(`Stored ${file.size} bytes as ${fileRef}`);

    return fileRef;
  }

  /**
   * Best-effort removal of the underlying bytes. Retention cleanup in Phase 4
   * deliberately drops the reference without calling this — the record goes,
   * the archived file stays.
   */
  async remove(fileRef: string): Promise<void> {
    try {
      await unlink(join(this.root, fileRef));
    } catch {
      this.logger.warn(`Could not delete ${fileRef} — leaving it in place`);
    }
  }

  private validate(file: UploadedFile): void {
    if (!file?.buffer?.length) {
      throw new BadRequestException('The uploaded file is empty');
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(
        `File exceeds the ${MAX_UPLOAD_BYTES / 1024 / 1024}MB limit`,
      );
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type ${file.mimetype}. Allowed: ${[...ALLOWED_MIME_TYPES].join(', ')}`,
      );
    }
  }
}
