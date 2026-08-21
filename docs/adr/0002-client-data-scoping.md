# 2. Client scoping is derived from the principal and answers 404

- **Status:** Accepted
- **Date:** 2026-08-21
- **Phase:** 2 (Gate 2 — order lifecycle covered)

## Context

Two roles share one API. An Office Manager sees everything; a client sees their
own orders and nothing else. The roadmap states the requirement without room
for interpretation: *"Middleware enforces data scoping — client A cannot access
client B data under any request."*

"Under any request" is the hard part. A client has several ways to name another
client's data: a UUID in a path, a `clientId` query parameter, a nested route
under someone else's order, or a body field on a write.

## Decision

**Authentication is on by default.** `JwtAuthGuard` and `RolesGuard` are
registered as `APP_GUARD`s, so every route in the application is authenticated
unless it carries `@Public()` (login and the health probes) and role-restricted
where it carries `@Roles()`. Adding a controller cannot accidentally add an
open endpoint.

**The principal is rebuilt from the database on every request.** The token
proves identity; it is not a cache of authority. `JwtStrategy` re-reads `role`
and `client_id` from the row, so revoking a user or moving them between clients
takes effect on the next request instead of whenever their token expires.

**Scope comes from the principal, never from the request.** `scopeWhere(user)`
returns `{ clientId }` for a client and `{}` for a manager, and it is spread
*last* into every Prisma `where`. A client passing `?clientId=<someone else>`
gets their own rows back — the parameter is overridden rather than obeyed, and
there is no code path where a client-supplied id becomes the filter.

**A `CLIENT` user with no `client_id` fails closed.** That combination is a
broken row, not an unscoped one, and it raises 403 rather than falling through
to an empty filter. `UsersService` refuses to create the combination in the
first place.

**Out-of-scope reads answer 404, not 403.** A 403 confirms the record exists,
which is enough to enumerate ids by watching the status code change. Reads are
scoped at the query — `findFirst({ where: { id, ...scopeWhere(user) } })` — so
"not yours" and "not there" are genuinely the same answer. Role violations
(a client attempting a write) still answer 403, because the endpoint's
existence is not a secret.

## Consequences

- Every service method that can be reached by a client takes the principal
  explicitly. Scoping decisions are visible in the signature rather than pulled
  from an ambient request object.
- Nested resources scope through their parent: order items and status history
  resolve the order first, so one check covers the whole subtree.
- The two rules are enforced in different places — roles at the guard, rows in
  the service — and `test/e2e/client-scoping.e2e-spec.ts` covers both from the
  outside, through the request paths a curious client actually has.
- Client documents go further: `file_ref` is omitted at the query, so no read
  path can leak the storage pointer by forgetting to strip it.
