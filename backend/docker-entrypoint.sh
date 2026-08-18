#!/bin/sh
# Backend container entrypoint.
#
# Applies migrations before the API starts, so `docker compose up` from a
# clean clone reaches a working schema in one command (Gate 1). Only the
# backend service runs this — the worker shares the image but must not race
# it for the migration lock.
set -e

echo "[entrypoint] Applying database migrations…"
npx prisma migrate deploy

if [ "${SEED_ON_START}" = "true" ]; then
  echo "[entrypoint] Seeding demo data…"
  npx ts-node prisma/seed/seed.ts
fi

echo "[entrypoint] Starting: $*"
exec "$@"
