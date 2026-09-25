# 3. The capacity guard runs under a container row lock

- **Status:** Accepted
- **Date:** 2026-09-25
- **Phase:** 3 (Gate 3 — shipping lifecycle covered)

## Context

Consolidated shipping puts several clients' orders in one container through
`container_allocations`. The roadmap requires *"a capacity guard [that] rejects
any allocation that would cause the container to exceed its CBM or weight
maximum"*, tested at the boundary value.

The obvious implementation is a read-then-write: sum the existing allocations,
add the new one, compare with capacity, insert. That check is correct and still
not safe. Two office staff allocating the last 5 CBM at the same moment each
read "5 CBM free", each pass, and the box is booked at 110%. Nothing about the
resulting rows looks wrong until the freight provider refuses the container.

A database `CHECK` constraint cannot express the rule, because it spans rows.
A trigger could, but it would move the business rule and its error message
out of the service layer the rest of the codebase keeps them in.

## Decision

**Every write that depends on a container's state or remaining capacity takes
a row lock on the container first.** `lockContainer()` runs
`SELECT … FROM containers WHERE id = $1 FOR UPDATE` inside the interactive
transaction, then reads the container. Allocation create, resize and delete,
capacity edits, transit-leg changes and container status transitions all go
through it.

The lock serialises writers per container, not globally: allocating to two
different boxes never waits. A second writer to the same box blocks until the
first commits, then re-reads the sums — which now include the first
allocation — and is rejected by the same guard.

**The guard itself is a pure function** (`assertFits`) over `Prisma.Decimal`,
so the boundary behaviour is unit-tested without a database: filling exactly
to capacity passes, 0.001 CBM or 0.001 kg over fails, and `0.1 + 0.2` cannot
decide whether the last order fits. Either limit is enough to refuse; the
error names each limit breached and how much room is left.

**Container status transitions also use the lock** rather than the
compare-and-swap that orders use. An order transition's preconditions read
other tables that are either immutable by then or not being raced. A
container's read its own children — allocations must not change between
"is anything allocated?" and `FULLY_ALLOCATED`, and legs must not change between
"are all stops complete?" and `ARRIVED`.

## Consequences

- The e2e suite fires two allocations for the last space concurrently and
  asserts exactly one `201` and one `422`, with one row written.
- Allocations can only change while the container is `OPEN_FOR_ALLOCATION`.
  `FULLY_ALLOCATED` means the booking is locked with the freight provider, so
  the declared manifest is frozen with it.
- Capacity cannot be shrunk below what is already allocated, for the same
  reason the guard exists.
- The container and order lifecycles stay independent, as the state diagram
  draws them. They meet in exactly one place: a container moves to `CLOSED`
  only when every allocated order is `CLOSED_OUT`.
