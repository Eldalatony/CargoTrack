# CargoTrack

Logistics & import-export management platform.

Full-cycle order management for a consolidated-shipping freight operation: client
orders, supplier production and QC, container consolidation, transit legs,
warehousing, document version chains, payments, and a retrying notification
pipeline.

> **Status:** Phase 4 complete — **Gate 4 met**. The backend is feature-complete
> for the domain. Payments gate the order lifecycle: the deposit must clear
> before goods are received, and the balance before close-out. Shipping
> documents are withheld from the client until the balance clears, re-checked
> against the payment ledger on every request and proven by a test that sweeps
> every GET route in the app. Every status change notifies through a
> retrying, dead-lettering BullMQ pipeline, and a scheduled job enforces
> retention on client documents. Phase 5 is the frontend. See
> `Information/Cargo_Track_Roadmap.docx` for the full 7-phase plan.

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind |
| Backend | NestJS 11, TypeScript |
| Database | PostgreSQL 16 |
| ORM & migrations | Prisma 6 / Prisma Migrate |
| Queue | BullMQ on Redis 7 |
| Local orchestration | Docker Compose |

## Quick start

```bash
git clone <repo-url> CargoTrack
cd CargoTrack

cp .env.example .env               # then replace every change_me_* value
git config core.hooksPath .githooks

docker compose up --build
```

That is the whole setup. On first start the backend container applies all
migrations and seeds demo data before the API begins listening.

| | |
|---|---|
| Frontend | http://localhost:3000 |
| API | http://localhost:4000 |
| API health | http://localhost:4000/health |
| Swagger docs | http://localhost:4000/api/docs |

Demo login password for every seeded user: `CargoTrack!2026`

| Email | Role |
|---|---|
| `manager@cargotrack.example` | Office Manager |
| `hassan@niletrading.example` | Client — Nile Trading |
| `mona@deltaimports.example` | Client — Delta Imports |
| `youssef@cairoretail.example` | Client — Cairo Retail |

## Verifying the gates

Gates are binary and verified by running the scenario, not by inspection:

```bash
./infra/scripts/verify-gate1.sh            # against a running stack
./infra/scripts/verify-gate1.sh --clean    # wipe volumes, rebuild, then check
./infra/scripts/verify-gate2.sh            # against a running stack
./infra/scripts/verify-gate3.sh            # against a running stack
./infra/scripts/verify-gate4.sh            # against a running stack (~90 s)
```

**Gate 1** asserts all five services healthy, exactly 19 tables present, Redis
answering `PING`, `prisma migrate status` in sync, both health endpoints
returning ok, and demo data loaded.

**Gate 2** logs in, creates its own client and supplier, and walks one order
through all 8 states over HTTP — placing it, confirming it, running the batch
through the factory, recording and signing off QC, shipping it and closing it
out. Along the way it asserts that an invalid transition is refused with 422
and a message naming the legal targets, that `status` cannot be set through
`PATCH`, that shipment booking is blocked until QC is signed off, that the
`status_history` chain has 8 rows with no gaps, and that a client can reach
none of it. It cleans up after itself, so it is safe to re-run.

**Gate 3** walks two different clients' orders to `SHIPMENT_BOOKING` and
consolidates them into one 20 CBM transit container. The first order takes
10.2 CBM; the second is offered at 9.801 CBM and refused (boundary + 0.001),
then accepted at 9.8 — exactly 100%. The container is booked, refused
departure until a transit stop is planned, sailed, walked through the stop at
Jebel Ali (arrival before departure, enforced), and arrived. Closing it is
refused while either order is open, refused again with only one closed out,
and accepted once both are. The `status_history` chain has 5 rows with no gaps.

**Gate 4** confirms an order with its 20% deposit in the same call, then shows
a second order refused at goods-in with no deposit (`guard: deposit`). It walks
the first order to delivery, uploads its bill of lading and raises the balance
invoice. As the client, the document read has no `file_ref` key at all, only
`withheld: true` and "8000.00 USD outstanding", and the download is a 403. It
then shows close-out refused (`guard: balance`) and moves the order to
`DOCUMENTS_WITHHELD`. Marking the balance paid releases the document, stamps
`released_to_client_at`, serves the file, and closes the order out by itself.
The script also runs the gate's automated tests: the unit tests, the guard that
fails the build if they are ever skipped, and the e2e sweep of every GET route.
It then waits for the live worker to exhaust all 5 attempts on a mailbox under
the reserved `.invalid` TLD (`FAILED` between attempts, then `DEAD_LETTER` with
`retry_count` 5 and `last_error` kept), finds it in the dashboard view and
re-queues it. Finally it runs the retention sweep and confirms that the expired
passport reference is gone while the stored file is not.

The same ground is covered from inside the container by the e2e suite:

```bash
docker compose exec backend npm run test:e2e     # needs the live stack
docker compose exec backend npm test             # unit tests, no stack needed
```

## Services

| Service | Port | Purpose |
|---|---|---|
| `postgres` | 5432 | Primary database |
| `redis` | 6379 | BullMQ broker |
| `backend` | 4000 | NestJS API. Owns migrations on startup. |
| `worker` | 4001 (internal) | BullMQ consumer. Same image, different command. |
| `frontend` | 3000 | Next.js |

Every service has a health check that touches something real — the backend and
worker both verify Postgres and Redis reachability, so a crash-looping worker
cannot report healthy. `backend` and `worker` gate on postgres and redis being
healthy; `frontend` gates on `backend`.

## The API

Everything is under `/api`, authenticated with a bearer token. Swagger lists it
all at http://localhost:4000/api/docs.

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"manager@cargotrack.example","password":"CargoTrack!2026"}' \
  | jq -r .accessToken)

curl -s http://localhost:4000/api/orders -H "Authorization: Bearer $TOKEN"
```

| Endpoint | Who |
|---|---|
| `POST /auth/login`, `GET /auth/me` | anyone / any signed-in user |
| `GET|POST|PATCH|DELETE /clients` | manager (a client sees only their own row) |
| `POST|GET|DELETE /clients/:id/documents` | manager uploads; client lists their own |
| `/suppliers`, `/freight-providers`, `/customs-agents`, `/users` | manager only |
| `GET|POST|PATCH|DELETE /orders` | manager writes; client reads their own |
| `POST /orders/:id/status` | manager — the only way status moves |
| `GET /orders/:id/status-history` | manager, or the client who owns the order |
| `/orders/:id/items` | manager writes; client reads their own |
| `/production-orders`, `POST /production-orders/:id/status` | manager writes; client reads |
| `/qc-inspections`, `PATCH /qc-inspections/:id/sign-off` | manager writes; client reads |
| `GET /status-history?entityType=&entityId=` | manager only |
| `POST /documents` (multipart, `supersedesId` for a new version) | manager |
| `GET /documents`, `/documents/:id`, `/:id/versions`, `/:id/file` | manager; client reads their own, `file_ref` and file only once paid |
| `POST /payments`, `POST /payments/:id/paid`, `DELETE /payments/:id` | manager |
| `GET /payments`, `GET /orders/:id/settlement` | manager; client sees only money between them and the office |
| `GET /notifications` | manager sees all; client sees their own client-visible messages |
| `GET /notifications/summary`, `POST /notifications/:id/retry` | manager only |
| `POST /client-documents/retention/run` | manager only (the worker also runs it nightly) |

Two roles, and the difference between them is enforced in two places. Role
checks live in a global guard; row-level scoping lives in the services and is
derived from the token's principal, never from the request — a client passing
`?clientId=<someone else>` gets their own rows back. Out-of-scope reads answer
404 rather than 403, because 403 would confirm the record exists. See
`docs/adr/0002-client-data-scoping.md`.

### The order lifecycle

Status is not a writable field. `PATCH /orders/:id` cannot set it, and a
request that tries is a 400; the only door is `POST /orders/:id/status`, where
the transition table from the state diagram runs. Rules worth knowing:

- **8 states, 4 exception branches** — `common/state-machines/order.state-machine.ts`
  is a literal transcription of `Information/Cargo_Track_StateDiagram.png`.
- **Invalid transitions are 422**, with a message naming the legal targets. The
  request is well-formed; the entity's state is what makes it unprocessable.
- **Every accepted move writes `status_history`** in the same transaction as
  the status column, with the actor and an optional reason. The trail opens at
  creation with `from_status = NULL`.
- **An order cannot be confirmed with no items.** There would be nothing to
  produce or ship.
- **No QC sign-off, no shipment.** The client signs the QC sheet in person;
  until `PATCH /qc-inspections/:id/sign-off` has been called for the order, it
  cannot leave `GOODS_RECEIVED`, and no balance invoice can be raised.
- **Volume and weight are derived**, never submitted: order totals roll up from
  the line items on every change, in Decimal arithmetic.
- **Payment guards** sit where the state diagram draws them. A failed guard
  returns 422 with `error: "guard_failed"` and the guard's name.
  - `deposit`: `ORDER_CONFIRMED → GOODS_RECEIVED` needs the order's deposit
    percentage cleared. The deposit can be recorded in the confirming call
    (`{"status":"ORDER_CONFIRMED","deposit":{"amount":2000}}`), in the same
    transaction.
  - `balance`: `→ CLOSED_OUT` from `DELIVERED` or `DOCUMENTS_WITHHELD` needs
    the order paid in full.
  - `qc_signoff`: a balance invoice needs a signed QC sheet.
- **`DOCUMENTS_WITHHELD` releases itself.** The payment that clears the balance
  releases the order's documents and moves it to `CLOSED_OUT` in the same
  transaction.

`docs/adr/0001-server-side-status-transitions.md` records why.

### Payments and the document release gate

A payment with no `paid_at` is an invoice that has been raised; setting
`paid_at` (`POST /payments/:id/paid`) means the money arrived. Settlement counts
client money only: deposit plus balance, less refunds, in the order's own
currency. A client payment in any other currency is refused rather than
silently ignored.

Whether a client may have a document is decided on every request, from the
live ledger. `released_to_client_at` records when the documents went out, but
it is not what grants access. If a refund reopens the balance, `file_ref`
disappears from the client's responses again. A withheld response leaves
`file_ref` out entirely and carries `withheld: true` with the outstanding
amount instead. Container-level documents cover several clients and are never
released to any one of them. See `docs/adr/0004-document-release-gate-at-read-time.md`.

### Notifications

Every `status_history` row writes its NOTIFICATIONS rows in the same
transaction (an outbox). The API relays committed `PENDING` rows to BullMQ, with
the row id as the job id so an enqueue can never be duplicated, and the worker
delivers them. There are 5 attempts with exponential backoff from 5 s. The row
reads `RETRYING` during each attempt, `FAILED` between attempts, and
`DEAD_LETTER` once attempts run out, with `retry_count` and `last_error` kept.
Delivery is still a stub that logs a line per message, but its failure modes are
real: an address under the reserved `.invalid` TLD bounces, and a recipient that
no longer exists is dead-lettered at once. See `docs/adr/0005-notification-outbox.md`.

## Repository layout

```
.
├── backend/                 NestJS API + BullMQ worker (shared image)
│   ├── prisma/
│   │   ├── schema.prisma    19 models mirroring the ERD
│   │   ├── migrations/      Version-controlled schema — no raw DDL anywhere else
│   │   └── seed/seed.ts     Demo data covering all 19 entity types
│   ├── src/
│   │   ├── common/          Cross-cutting building blocks
│   │   │   ├── access/           Client row-level scoping
│   │   │   ├── decorators/       @Public, @Roles, @CurrentUser
│   │   │   ├── guards/           JWT + role guards, applied globally
│   │   │   ├── filters/          Prisma error codes to HTTP answers
│   │   │   ├── state-machines/   Order (8 states) & production order
│   │   │   └── storage/          Uploads land on disk, refs land in the DB
│   │   ├── config/          Env validation — the only place env is read
│   │   ├── health/          Terminus indicators for Postgres and Redis
│   │   ├── jobs/            BullMQ queues, processors, delivery (worker side)
│   │   ├── modules/         One module per domain entity
│   │   │                    auth, users, clients, client-documents,
│   │   │                    suppliers, freight-providers, customs-agents,
│   │   │                    orders, order-items, production-orders,
│   │   │                    qc-inspections, status-history, containers,
│   │   │                    container-allocations, transit-legs,
│   │   │                    warehouses, stock-records, documents,
│   │   │                    payments, notifications
│   │   ├── app.setup.ts     Pipes, CORS, prefix — shared by main and the e2e suite
│   │   ├── main.ts          API entrypoint
│   │   └── worker.ts        Worker entrypoint
│   ├── docker-entrypoint.sh Runs migrations before the API starts
│   └── test/
│       ├── e2e/             Gates 2–4 over HTTP: lifecycles, scoping, payments,
│       │                    the document gate's route sweep, the retry pipeline
│       └── fixtures/        Boots the real app; builds two clients and a manager
├── frontend/                Next.js app
│   └── src/app/
│       ├── (auth)/          Login
│       ├── (manager)/       Office Manager — full access
│       ├── (portal)/        Client — read-only, own orders only
│       └── health/          Liveness route probed by Compose
├── infra/
│   ├── docker/postgres/init/    Init SQL run once on first volume create
│   └── scripts/                 bootstrap.sh, verify-gate1/2/3/4.sh
├── docs/
│   ├── adr/                 Architecture decision records
│   └── diagrams/            Mermaid sources for the ERD and state diagrams
├── Information/             Source design artifacts (ERD, roadmap, diagrams)
├── docker-compose.yml
└── .env.example
```

## Data model

19 entities, mirroring `Information/Cargo_Track_ERD.pdf`:

**Parties** — `users`, `clients`, `client_documents`, `suppliers`,
`freight_providers`, `customs_agents`
**Orders** — `orders`, `order_items`, `production_orders`, `qc_inspections`
**Warehousing** — `warehouses`, `stock_records`
**Shipping** — `containers`, `container_allocations`, `transit_legs`
**Cross-cutting** — `documents`, `payments`, `status_history`, `notifications`

Status columns are Postgres enums, never free strings. Every money column
carries an explicit currency column. `status_history` and `notifications` are
append-only.

The seed is built around three deliberate scenarios rather than random rows:
Nile Trading (closed out, documents released), Delta Imports (mid-flight,
awaiting QC sign-off), and Cairo Retail (delivered, balance unpaid, documents
withheld) — the last being the fixture for the strongest business rule in the
domain.

## Common commands

```bash
docker compose up -d                    # start
docker compose logs -f backend          # follow API logs
docker compose ps                       # health status
docker compose down                     # stop
docker compose down -v                  # stop and drop all data

# Migrations (run inside the backend container — DATABASE_URL is injected there)
docker compose exec backend npx prisma migrate dev --name <change>
docker compose exec backend npx prisma migrate status
docker compose exec backend npx prisma studio

# Reseed from scratch
docker compose exec -e SEED_FORCE=true backend npx ts-node prisma/seed/seed.ts

# Postgres shell
docker compose exec postgres psql -U cargotrack -d cargotrack
```

## Environment configuration

`DATABASE_URL` and `REDIS_URL` are the only database and queue settings the
application reads. Locally they come from `.env`; in production the platform
injects them. No Compose DNS hostname (`postgres`, `redis`, `backend`) appears
in application code — this is what lets the same image run locally and on
Railway unchanged.

The API and the worker share an image but validate different environment
schemas: the worker serves no HTTP traffic and issues no tokens, so it does not
require `JWT_SECRET` or `CORS_ORIGIN`.

`NEXT_PUBLIC_API_BASE_URL` is resolved by the browser, not by Docker, so it
points at `http://localhost:4000` locally — never at the `backend` service
name. It is inlined at build time, which is why the frontend production stage
takes it as a build arg.

## Commit convention

Conventional Commits are enforced by `.githooks/commit-msg`, a plain shell hook
with no dependencies. Enable it once per clone:

```bash
git config core.hooksPath .githooks
```

```
feat(containers): enforce CBM capacity guard on allocation
fix(documents): withhold file_ref when balance payment is unpaid
```

## Roadmap position

- [x] **Gate 0** — design freeze (ERD, state diagrams, roadmap)
- [x] **Gate 1** — dev baseline: clean clone to all services healthy, 19 tables,
      fresh migration, Redis responding
- [x] **Gate 2** — order lifecycle covered end to end via API: all 8 states,
      invalid transitions refused with 422, `status_history` written at every
      step
- [x] **Gate 3** — shipping lifecycle with consolidated allocation: container
      opened, shared by two clients, transited, arrived and closed only after
      every allocated order closed out; capacity guard tested at the boundary
- [x] **Gate 4** — business rules verified: document withholding gate proven by
      an automated test that cannot be disabled, deposit recorded on
      confirmation, balance payment triggers release, retry pipeline cycles
      through failure, retry and dead letter
- [ ] **Gate 5** — end-to-end user journey through the UI
- [ ] **Gate 6** — launch ready

## Design artifacts

- `Information/Cargo_Track_ERD.pdf` — 19 entities, 16 relationships
- `Information/Cargo_Track_StateDiagram.png` — order and container lifecycles
- `Information/Cargo_Track_Roadmap.docx` — 7 phases, 24 milestones, 7 gates
