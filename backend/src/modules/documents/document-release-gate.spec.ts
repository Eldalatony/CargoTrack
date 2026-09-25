import { DocumentType, Prisma, UserRole } from '@prisma/client';

import {
  DocumentRow,
  presentDocument,
  releaseDecision,
} from './document-release-gate';

const paid = {
  paidInFull: true,
  balanceDue: new Prisma.Decimal(0),
  currency: 'USD',
};

const unpaid = {
  paidInFull: false,
  balanceDue: new Prisma.Decimal('19200'),
  currency: 'USD',
};

const client = {
  id: 'u-client',
  email: 'client@example.test',
  name: 'Client',
  role: UserRole.CLIENT,
  clientId: 'c-1',
};

const manager = { ...client, role: UserRole.OFFICE_MANAGER, clientId: null };

function row(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: 'd-1',
    orderId: 'o-1',
    containerId: null,
    docType: DocumentType.BILL_OF_LADING,
    version: 1,
    supersedesId: null,
    fileRef: 'documents/secret-bill-of-lading.pdf',
    preparedBy: 'u-manager',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    releasedToClientAt: new Date('2026-09-02T00:00:00Z'),
    updatedAt: new Date('2026-09-02T00:00:00Z'),
    supersededBy: null,
    ...overrides,
  };
}

describe('releaseDecision', () => {
  it('releases a stamped document on a paid-in-full order', () => {
    expect(releaseDecision(row(), paid)).toEqual({
      released: true,
      withheldReason: null,
    });
  });

  it('withholds when the balance is unpaid, and says how much is due', () => {
    const decision = releaseDecision(row(), unpaid);

    expect(decision.released).toBe(false);
    expect(decision.withheldReason).toContain('19200.00 USD outstanding');
  });

  it('withholds a document stamped as released once the balance reopens', () => {
    // The stamp is history, not permission.
    expect(releaseDecision(row(), unpaid).released).toBe(false);
  });

  it('withholds when there is no ledger to read at all', () => {
    expect(releaseDecision(row(), undefined).released).toBe(false);
    expect(releaseDecision(row(), null).released).toBe(false);
  });

  it('withholds a paid order document that was never stamped', () => {
    expect(
      releaseDecision(row({ releasedToClientAt: null }), paid).released,
    ).toBe(false);
  });

  it('never releases a container-level document to a client', () => {
    expect(
      releaseDecision(row({ orderId: null, containerId: 'k-1' }), paid)
        .released,
    ).toBe(false);
  });
});

describe('presentDocument', () => {
  it('omits the file_ref key entirely for a client while withheld', () => {
    const view = presentDocument(row(), client, unpaid);

    expect('fileRef' in view).toBe(false);
    expect(JSON.stringify(view)).not.toContain('secret-bill-of-lading');
    expect(view.withheld).toBe(true);
  });

  it('includes the file_ref for a client once released', () => {
    expect(presentDocument(row(), client, paid).fileRef).toBe(
      'documents/secret-bill-of-lading.pdf',
    );
  });

  it('always includes the file_ref for the office, and still reports the client view', () => {
    const view = presentDocument(row(), manager, unpaid);

    expect(view.fileRef).toBe('documents/secret-bill-of-lading.pdf');
    expect(view.withheld).toBe(true);
  });

  it('marks superseded versions as not current', () => {
    const view = presentDocument(
      row({ supersededBy: { id: 'd-2' } }),
      manager,
      paid,
    );

    expect(view.isCurrent).toBe(false);
    expect(view.supersededById).toBe('d-2');
  });
});
