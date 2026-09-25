import { Document, UserRole } from '@prisma/client';

import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { Settlement } from '../payments/settlement';

/**
 * THE STRONGEST BUSINESS RULE IN THE DOMAIN.
 *
 * A client does not get their shipping documents — the bill of lading that
 * lets them collect the goods — until the balance is paid. The office's only
 * leverage over a late payer is that piece of paper.
 *
 * The decision is made here, at read time, on every request, from the live
 * payment ledger. `released_to_client_at` records *when* the documents went
 * out; it is not trusted as the reason they may go out. If the agreed price
 * is revised upward after release, or a refund reopens the balance, the
 * stamp stays in the history and the file_ref disappears from the response
 * again until the money is back.
 *
 * Every client-facing document read goes through presentDocument(), which
 * builds the response field by field and adds file_ref only on an open gate.
 * There is no path that spreads a raw row into a response.
 */
export interface ReleaseDecision {
  released: boolean;
  /** Why the client cannot have the file yet, in words the portal can show. */
  withheldReason: string | null;
}

type GateSettlement = Pick<
  Settlement,
  'paidInFull' | 'balanceDue' | 'currency'
>;

export function releaseDecision(
  document: Pick<Document, 'orderId' | 'releasedToClientAt'>,
  settlement: GateSettlement | null | undefined,
): ReleaseDecision {
  if (!document.orderId) {
    return {
      released: false,
      withheldReason:
        'Container-level documents cover several clients and are held by the office',
    };
  }

  if (!settlement || !settlement.paidInFull) {
    const due = settlement
      ? ` (${settlement.balanceDue.toFixed(2)} ${settlement.currency} outstanding)`
      : '';

    return {
      released: false,
      withheldReason: `Withheld until the balance payment clears${due}`,
    };
  }

  if (!document.releasedToClientAt) {
    return {
      released: false,
      withheldReason: 'Not yet released to the client',
    };
  }

  return { released: true, withheldReason: null };
}

export type DocumentRow = Document & { supersededBy: { id: string } | null };

/** The only shape a document leaves the API in. */
export interface DocumentView {
  id: string;
  orderId: string | null;
  containerId: string | null;
  docType: Document['docType'];
  version: number;
  supersedesId: string | null;
  supersededById: string | null;
  isCurrent: boolean;
  preparedBy: string | null;
  createdAt: Date;
  releasedToClientAt: Date | null;
  /** From the client's point of view, whichever role is looking. */
  withheld: boolean;
  withheldReason: string | null;
  /** Absent — not null, absent — when the viewer may not have the file. */
  fileRef?: string;
}

export function presentDocument(
  document: DocumentRow,
  viewer: AuthenticatedUser,
  settlement: GateSettlement | null | undefined,
): DocumentView {
  const decision = releaseDecision(document, settlement);

  const view: DocumentView = {
    id: document.id,
    orderId: document.orderId,
    containerId: document.containerId,
    docType: document.docType,
    version: document.version,
    supersedesId: document.supersedesId,
    supersededById: document.supersededBy?.id ?? null,
    isCurrent: document.supersededBy === null,
    preparedBy: document.preparedBy,
    createdAt: document.createdAt,
    releasedToClientAt: document.releasedToClientAt,
    withheld: !decision.released,
    withheldReason: decision.withheldReason,
  };

  if (mayHaveFile(viewer, decision)) {
    view.fileRef = document.fileRef;
  }

  return view;
}

/** The office holds the documents; the gate only ever closes on a client. */
export function mayHaveFile(
  viewer: Pick<AuthenticatedUser, 'role'>,
  decision: ReleaseDecision,
): boolean {
  return viewer.role === UserRole.OFFICE_MANAGER || decision.released;
}
