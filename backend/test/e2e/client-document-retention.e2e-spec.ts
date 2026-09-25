import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { INestApplication } from '@nestjs/common';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  Actors,
  createActors,
  createTestApp,
  destroyActors,
  http,
  login,
} from '../fixtures/test-app';

/**
 * Roadmap Phase 4: "Sensitive document references isolated in the
 * CLIENT_DOCUMENTS table with retention_expires_at per record. A scheduled
 * cleanup job removes expired references without deleting the underlying
 * document from storage."
 *
 * The worker runs the sweep nightly from the retention queue; the endpoint
 * runs the same method on demand, which is what this drives.
 */
describe('client document retention', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let actors: Actors;
  let managerToken: string;
  let clientAToken: string;

  let expiredId: string;
  let expiredFileRef: string;
  let currentId: string;
  const storedFiles: string[] = [];

  const asManager = () => ({ Authorization: `Bearer ${managerToken}` });
  const storageRoot = process.env.FILE_STORAGE_PATH ?? '/app/storage';

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    actors = await createActors(prisma);
    managerToken = await login(app, `manager-${actors.suffix}@cargotrack.test`);
    clientAToken = await login(app, `user-a-${actors.suffix}@cargotrack.test`);

    expiredId = await upload(new Date(Date.now() + 60 * 60_000));
    currentId = await upload(new Date(Date.now() + 365 * 86_400_000));

    // Uploads refuse a past date only by convention — backdate one directly
    // so it is already expired, as it would be a year from now.
    const expired = await prisma.clientDocument.update({
      where: { id: expiredId },
      data: { retentionExpiresAt: new Date(Date.now() - 60_000) },
    });
    expiredFileRef = expired.fileRef;
  });

  afterAll(async () => {
    // The sweep leaves files behind by design; the test cleans its own.
    for (const fileRef of storedFiles) {
      await unlink(join(storageRoot, fileRef)).catch(() => undefined);
    }

    await destroyActors(prisma, actors);
    await app.close();
  });

  async function upload(retentionExpiresAt: Date): Promise<string> {
    const response = await http(app)
      .post(`/api/clients/${actors.clientAId}/documents`)
      .set(asManager())
      .attach('file', Buffer.from('%PDF-1.4 passport scan'), {
        filename: 'passport.pdf',
        contentType: 'application/pdf',
      })
      .field('docType', 'PASSPORT_SCAN')
      .field('retentionExpiresAt', retentionExpiresAt.toISOString())
      .expect(201);

    const id = (response.body as { id: string }).id;
    const row = await prisma.clientDocument.findUniqueOrThrow({
      where: { id },
    });
    storedFiles.push(row.fileRef);

    return id;
  }

  it('hides an expired reference before the sweep has even run', async () => {
    const response = await http(app)
      .get(`/api/clients/${actors.clientAId}/documents`)
      .set({ Authorization: `Bearer ${clientAToken}` })
      .expect(200);

    const ids = (response.body as { id: string }[]).map((doc) => doc.id);

    expect(ids).toContain(currentId);
    expect(ids).not.toContain(expiredId);
  });

  it('removes expired references and keeps the rest', async () => {
    const response = await http(app)
      .post('/api/client-documents/retention/run')
      .set(asManager())
      .expect(200);

    expect((response.body as { purged: number }).purged).toBeGreaterThanOrEqual(
      1,
    );

    expect(
      await prisma.clientDocument.findUnique({ where: { id: expiredId } }),
    ).toBeNull();
    expect(
      await prisma.clientDocument.findUnique({ where: { id: currentId } }),
    ).not.toBeNull();
  });

  it('leaves the underlying file in storage', () => {
    expect(existsSync(join(storageRoot, expiredFileRef))).toBe(true);
  });

  it('is an office operation', async () => {
    await http(app)
      .post('/api/client-documents/retention/run')
      .set({ Authorization: `Bearer ${clientAToken}` })
      .expect(403);
  });
});
