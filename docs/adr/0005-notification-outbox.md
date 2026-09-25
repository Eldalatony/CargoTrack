# 5. Notifications go through a transactional outbox

- **Status:** Accepted
- **Date:** 2026-09-25
- **Phase:** 4 (Gate 4 — business rules verified)

## Context

The roadmap: *"Every status transition enqueues a background job. Each record
carries retry_count, last_error, and a dead-letter status field. Failed jobs
surface in the Office Manager dashboard."* The pipeline diagram
(`Information/Cargo_Track_NotificationPipeline.png`) has the API enqueueing and
the worker consuming, as separate services.

A status change commits to Postgres and a job goes to Redis. Those are two
systems with no shared transaction, which leaves two ways to fail:

- **Enqueue inside the transaction.** The worker can pick the job up before the
  transaction commits and find no row. If the transaction rolls back, the job
  announces a transition that never happened.
- **Enqueue after the commit.** If Redis is unreachable at that moment, or the
  process dies between the two steps, the transition stands and nobody is told,
  with no trace that a notification was ever owed.

## Decision

**The NOTIFICATIONS row is the outbox.** `StatusHistoryService.record()`, the
single choke point every status change already goes through, calls
`writeNotifications()` in the same transaction. The rows commit with the
transition or not at all. Because the hook sits in `record()`, transitions
added later notify without anyone remembering to wire it up. Payments and
documents write history rows too (`OUTSTANDING → PAID`,
`WITHHELD → RELEASED`), so they notify through the same path.

**The API relays and the worker delivers.** `NotificationRelay` runs in the API
process and every second offers committed `PENDING` rows to BullMQ, using the
row id as the job id. BullMQ ignores an add for a job id it already holds, so
offering a row twice cannot deliver it twice, and the relay never needs to be
sure whether it already enqueued something. It walks forward with a cursor, and
every 30th tick rescans from the oldest `PENDING` row. The rescan catches a
long transaction that commits a row with an older `created_at` than the cursor
has already passed.

**Bookkeeping happens inside the attempt.** `NotificationDelivery.attempt()`
marks the row `RETRYING` on pickup and `SENT` on success. On failure it writes
`FAILED` (attempts remain) or `DEAD_LETTER` (none remain), with `retry_count`
and `last_error`, and then rethrows so BullMQ schedules the backoff. This is
not done in a `failed` event listener, because BullMQ does not await
listeners. With a short backoff, the next attempt could mark the row
`RETRYING` before the listener marked it `FAILED`.

Retry policy: 5 attempts, exponential backoff from 5 s (5, 10, 20, 40 s),
`removeOnFail: false` so exhausted jobs stay inspectable. A recipient that
does not exist, or has no address on the channel, raises BullMQ's
`UnrecoverableError` and goes straight to `DEAD_LETTER`, since retrying cannot
help.

**Routing.** Anything a client is party to (their order, a container carrying
it, a document on it, money between them and the office) emails that client
and is client-visible. Internal changes (production batches, stock holds, an
empty container) go to every Office Manager's in-app inbox, hidden from
clients. What the office pays suppliers and forwarders never reaches a client.

**The provider is still a stub**, but its failure modes are real. It bounces
any address under the reserved `.invalid` TLD (RFC 2606), which can never be
delivered to. That is how `verify-gate4.sh` shows the full
`FAILED → DEAD_LETTER` path on the running stack without a switch that exists
only for tests.

## Consequences

- Latency is up to one relay interval (`NOTIFICATION_RELAY_INTERVAL_MS`,
  default 1000; 0 disables the relay) before a job reaches Redis.
- If Redis is down, notifications wait as `PENDING` rows and go out once it is
  back. Transitions never fail because of the queue.
- Dead letters are listed at `GET /notifications?status=DEAD_LETTER` and
  counted at `GET /notifications/summary`. `POST /notifications/:id/retry`
  gives a dead letter a fresh attempt budget. It first removes the exhausted
  job from BullMQ's failed set, because an add for an id the queue still holds
  would be ignored.
- The Gate 4 e2e suite drives the production delivery code from its own BullMQ
  worker on an isolated queue. It asserts the exact per-attempt sequence
  (`PENDING`, then `FAILED`, `FAILED` at pickup, `RETRYING` during every
  attempt) and one complete trip through the live stack.
