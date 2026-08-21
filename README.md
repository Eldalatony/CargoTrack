# CargoTrack

Logistics & import-export management platform.

Full-cycle order management for a consolidated-shipping freight operation: client
orders, supplier production and QC, container consolidation, transit legs,
warehousing, document version chains, payments, and a retrying notification
pipeline.

> **Status:** Phase 2 complete — **Gate 2 met**. An order walks all 8 states
> from Order Placed to Closed Out over the API alone, invalid transitions are
> refused with 422, and every step leaves a `status_history` row. Auth, parties,
> orders, production and QC are live; shipping and containers are Phase 3. See
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
  cannot leave `GOODS_RECEIVED`. Phase 4 hangs the balance invoice off the same
  check.
- **Volume and weight are derived**, never submitted: order totals roll up from
  the line items on every change, in Decimal arithmetic.

`docs/adr/0001-server-side-status-transitions.md` records why.

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
│   │   ├── jobs/            BullMQ queues and processors
│   │   ├── modules/         One module per domain entity
│   │   │                    auth, users, clients, client-documents,
│   │   │                    suppliers, freight-providers, customs-agents,
│   │   │                    orders, order-items, production-orders,
│   │   │                    qc-inspections, status-history
│   │   ├── app.setup.ts     Pipes, CORS, prefix — shared by main and the e2e suite
│   │   ├── main.ts          API entrypoint
│   │   └── worker.ts        Worker entrypoint
│   ├── docker-entrypoint.sh Runs migrations before the API starts
│   └── test/
│       ├── e2e/             The Gate 2 walk and client scoping, over HTTP
│       └── fixtures/        Boots the real app; builds two clients and a manager
├── frontend/                Next.js app
│   └── src/app/
│       ├── (auth)/          Login
│       ├── (manager)/       Office Manager — full access
│       ├── (portal)/        Client — read-only, own orders only
│       └── health/          Liveness route probed by Compose
├── infra/
│   ├── docker/postgres/init/    Init SQL run once on first volume create
│   └── scripts/                 bootstrap.sh, verify-gate1.sh
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
- [ ] **Gate 3** — shipping lifecycle with consolidated allocation
- [ ] **Gate 4** — document withholding gate proven by automated test
- [ ] **Gate 5** — end-to-end user journey through the UI
- [ ] **Gate 6** — launch ready

## Design artifacts

- `Information/Cargo_Track_ERD.pdf` — 19 entities, 16 relationships
- `Information/Cargo_Track_StateDiagram.png` — order and container lifecycles
- `Information/Cargo_Track_Roadmap.docx` — 7 phases, 24 milestones, 7 gates
