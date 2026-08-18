# CargoTrack

Logistics & import-export management platform.

Full-cycle order management for a consolidated-shipping freight operation: client
orders, supplier production and QC, container consolidation, transit legs,
warehousing, document version chains, payments, and a retrying notification
pipeline.

> **Status:** Phase 1 complete — **Gate 1 met**. The stack runs, all 19 tables
> are created by migration, and demo data covering every entity type loads on
> first start. Domain endpoints begin in Phase 2. See
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

## Verifying Gate 1

Gates are binary and verified by running the scenario, not by inspection:

```bash
./infra/scripts/verify-gate1.sh            # against a running stack
./infra/scripts/verify-gate1.sh --clean    # wipe volumes, rebuild, then check
```

It asserts all five services healthy, exactly 19 tables present, Redis
answering `PING`, `prisma migrate status` in sync, both health endpoints
returning ok, and demo data loaded.

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

## Repository layout

```
.
├── backend/                 NestJS API + BullMQ worker (shared image)
│   ├── prisma/
│   │   ├── schema.prisma    19 models mirroring the ERD
│   │   ├── migrations/      Version-controlled schema — no raw DDL anywhere else
│   │   └── seed/seed.ts     Demo data covering all 19 entity types
│   ├── src/
│   │   ├── common/          Guards, filters, interceptors, pipes
│   │   │   └── state-machines/   Order (8 states) & Container (5 states)
│   │   ├── config/          Env validation — the only place env is read
│   │   ├── health/          Terminus indicators for Postgres and Redis
│   │   ├── jobs/            BullMQ queues and processors
│   │   ├── modules/         One module per domain entity (Phase 2+)
│   │   ├── main.ts          API entrypoint
│   │   └── worker.ts        Worker entrypoint
│   ├── docker-entrypoint.sh Runs migrations before the API starts
│   └── test/                e2e, integration, fixtures
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
- [ ] **Gate 2** — order lifecycle covered end to end via API
- [ ] **Gate 3** — shipping lifecycle with consolidated allocation
- [ ] **Gate 4** — document withholding gate proven by automated test
- [ ] **Gate 5** — end-to-end user journey through the UI
- [ ] **Gate 6** — launch ready

## Design artifacts

- `Information/Cargo_Track_ERD.pdf` — 19 entities, 16 relationships
- `Information/Cargo_Track_StateDiagram.png` — order and container lifecycles
- `Information/Cargo_Track_Roadmap.docx` — 7 phases, 24 milestones, 7 gates
