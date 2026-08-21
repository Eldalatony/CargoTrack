# 1. Status moves through a state machine, not through a field

- **Status:** Accepted
- **Date:** 2026-08-21
- **Phase:** 2 (Gate 2 — order lifecycle covered)

## Context

An order has eight states on the happy path and four exception branches
(`Information/Cargo_Track_StateDiagram.png`). The column is a Postgres enum, so
the database rejects a value that is not a status — but it has no opinion about
*ordering*. `DELIVERED → ORDER_PLACED` is a perfectly valid enum value written
into a place it has no business being, and the same is true of every other
backwards or skipped move.

The roadmap makes this a gate condition rather than a nicety: *"Status
transitions enforced server-side — status is not a free string field. Every
valid transition writes to STATUS_HISTORY. Invalid transitions return HTTP
422."*

## Decision

**Status is not writable through the resource.** `PATCH /orders/:id` cannot set
it: `UpdateOrderDto` omits the field, and the global `ValidationPipe` runs with
`forbidNonWhitelisted`, so a request that tries is a 400 rather than a silent
no-op. The only door is `POST /orders/:id/status`.

**The transition table is data, in one file.** `common/state-machines/` holds a
generic `StateMachine<T>` plus one table per lifecycle. The table is a literal
map from state to permitted next states, which reads next to the diagram and
can be tested without booting Nest or touching a database.

**Illegal moves answer 422, and say what would have worked.** The request is
well-formed and the target is a real status; what makes it unprocessable is the
entity's current state. The message always names the legal targets — an error
the caller cannot act on is only half an error.

**The status column and its history row are written in one transaction.** A
transition that fails to leave a trail is worse than one that fails outright,
because nothing about the resulting row looks wrong afterwards. The trail opens
at creation with `from_status = NULL`, so an order's history is complete from
birth rather than from its first move.

**The write is a compare-and-swap.** The update is `where: { id, status: <the
status we validated against> }`, and a zero row count is a 409. Two managers
advancing the same order at the same moment would otherwise both pass
validation and write two history rows for one real move.

**Preconditions the table cannot express live beside it, not in it.** Some
moves depend on the rest of the order rather than on its current state: an
order cannot be confirmed with no items, and it cannot be booked for shipment
before a QC inspection has been signed off by the client. These are checked in
`OrdersService.assertPreconditionsFor` after the table approves the move.

## Consequences

- Adding a state means editing one table and one enum; the unit test fails
  immediately if the enum and the table disagree, which is what stops a new
  status from quietly becoming an unreachable dead end.
- Callers cannot batch a status change into a general update. That is
  deliberate: every move produces an audit row with an actor and an optional
  reason, and a PATCH that also moved status would make that trail ambiguous.
- The state machine throws `UnprocessableEntityException` directly rather than
  a domain error mapped by a filter. It costs the module a Nest import and buys
  one fewer layer between the rule and its HTTP answer; the unit test asserts
  the 422 rather than trusting a mapping elsewhere.
- `DELIVERED → CLOSED_OUT` is payment-gated on the diagram but ungated here.
  Payments arrive in Phase 4, and Gate 4 is where that check — and the document
  release it controls — is proven.
