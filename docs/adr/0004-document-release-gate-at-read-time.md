# 4. The document release gate is decided at read time

- **Status:** Accepted
- **Date:** 2026-09-25
- **Phase:** 4 (Gate 4 — business rules verified)

## Context

A client does not receive their shipping documents — above all the bill of
lading, without which the goods cannot be collected — until the balance is
paid. For an office whose clients sometimes pay late, that piece of paper is its
only leverage. The roadmap calls this the strongest business rule in the
domain, and asks for three things:

- `released_to_client_at` stays null until payment clears,
- the rule is *"enforced at read time on every request, not only at write
  time"* — a client whose payment is late gets no `file_ref` at all, not an
  empty one,
- *"an integration test verifies this gate cannot be bypassed by any request
  path."*

The obvious implementation stamps `released_to_client_at` when the balance
clears and filters on that column. It is correct on the day it is written and
wrong later. Nothing stops the balance from reopening after release: the agreed
price is revised upward, or a refund goes out. A stored flag would keep
releasing documents for money the office no longer holds.

## Decision

**Permission comes from the live ledger. The timestamp is only a record.**
`releaseDecision()` (`documents/document-release-gate.ts`) is a pure function
of the document and the order's current settlement. It releases only when all
of these hold:

1. the document belongs to an order (container-level documents cover several
   clients' goods and are never released to any one of them),
2. the order is paid in full *now* (`settle()` over the payments table: deposit
   plus balance received, less refunds paid out, in the order's currency), and
3. `released_to_client_at` is set.

`released_to_client_at` is stamped under the order row lock, in the same
transaction as the payment that makes the order whole, together with a
`WITHHELD → RELEASED` history row per document. A document uploaded after that
point is released as it arrives. The stamp answers "when did they get it". It
never answers "may they have it".

**One door out.** Every document response is built by `presentDocument()`,
field by field, and `file_ref` is added only when the viewer is the office or
the decision is `released`. No code path spreads a raw row into a response, so
a new column cannot leak by accident. When a document is withheld, `file_ref`
is left out of the response entirely rather than set to null. The response
carries `withheld: true` and a reason ("8000.00 USD outstanding"), so the portal
can show a pending state instead of just hiding a button. The download endpoint
asks the same function and answers 403 `documents_withheld`.

**The test enumerates the routes itself.** Besides the targeted cases, the e2e
suite reads the live Nest routing metadata, collects every GET route the
application registers, fills each path parameter with every id the fixture
knows, and requests them all as the owning client. It asserts that no response
contains a withheld `file_ref`, any fragment of one, or the file's bytes. It
also checks that it covered more than 40 routes and 300 requests, so a
discovery bug cannot pass as an empty sweep. A route added later that leaks a
document fails this test without anyone remembering to add it. This was
verified by planting a leak (`documents: true` on the order detail include):
the sweep failed and named `GET /api/orders/:id`.

**The test cannot be quietly disabled.** `gate-tests-cannot-be-skipped.spec.ts`
runs in the default unit suite. It fails if either gate spec is missing, or if
it contains `.skip`, `.only`, `.todo` or an `x`/`f`-prefixed case, or if the
route sweep has been removed.

## Consequences

- Every client document read costs one extra query, for the order's client
  payments (batched per page on list endpoints). That is the price of reading
  the ledger instead of trusting a flag, and it is cheap next to getting this
  rule wrong.
- A refund that reopens a balance takes the documents back out of the portal
  immediately. `released_to_client_at` keeps its value, so the history still
  shows the documents went out once.
- Client money must be in the order's currency. A deposit in EUR against a USD
  order would silently not count toward the gates, so it is refused with 422
  at write time.
- The office always sees `file_ref`. The gate only ever closes on a client.
