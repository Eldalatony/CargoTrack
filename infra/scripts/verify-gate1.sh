#!/usr/bin/env bash
# Gate 1 — dev baseline.
#
#   "docker compose up from a clean clone reaches all services. Postgres
#    tables exist. Redis responds. A fresh migration runs from scratch
#    without error."
#
# Gates are verified by running the scenario, not by inspection. Run this
# against a stack that is already up:
#
#   ./infra/scripts/verify-gate1.sh
#
# Add --clean to tear down volumes and rebuild from scratch first, which is
# the honest version of the check.

set -uo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

EXPECTED_TABLES=19
SERVICES=(postgres redis backend worker frontend)

pass=0
fail=0

check() {
  local label="$1"
  local detail="${2:-}"
  local ok="$3"

  if [ "$ok" = "0" ]; then
    printf '  [ PASS ] %-46s %s\n' "$label" "$detail"
    pass=$((pass + 1))
  else
    printf '  [ FAIL ] %-46s %s\n' "$label" "$detail"
    fail=$((fail + 1))
  fi
}

# Waits for every service to leave "health: starting". A fixed sleep is not
# good enough — the health checks have a 40s start_period, and a check that
# races startup reports a failure that is really just impatience.
wait_for_health() {
  local deadline=$((SECONDS + 180))

  while [ "$SECONDS" -lt "$deadline" ]; do
    local starting=0
    for service in "${SERVICES[@]}"; do
      case "$(docker compose ps "$service" --format '{{.Status}}' 2>/dev/null)" in
        *"health: starting"*) starting=$((starting + 1)) ;;
      esac
    done

    [ "$starting" -eq 0 ] && return 0
    sleep 5
  done

  echo "==> Timed out after 180s waiting for health checks to settle"
  return 1
}

if [ "${1:-}" = "--clean" ]; then
  echo "==> Tearing down (including volumes) and rebuilding…"
  docker compose down -v >/dev/null 2>&1
  docker compose up -d --build >/dev/null 2>&1
fi

echo "==> Waiting for health checks to settle…"
wait_for_health

echo ""
echo "Gate 1 — dev baseline"
echo "====================="
echo ""

echo "All services reach healthy"
for service in "${SERVICES[@]}"; do
  status=$(docker compose ps "$service" --format '{{.Status}}' 2>/dev/null)
  case "$status" in
    *healthy*) check "$service" "$status" 0 ;;
    *)         check "$service" "${status:-not running}" 1 ;;
  esac
done

echo ""
echo "Postgres tables exist"
table_count=$(docker compose exec -T postgres psql -U "${POSTGRES_USER:-cargotrack}" \
  -d "${POSTGRES_DB:-cargotrack}" -tAc \
  "SELECT count(*) FROM information_schema.tables
   WHERE table_schema='public' AND table_name <> '_prisma_migrations';" 2>/dev/null | tr -d '[:space:]')

[ "$table_count" = "$EXPECTED_TABLES" ]
check "all $EXPECTED_TABLES tables present" "found ${table_count:-0}" $?

echo ""
echo "Redis responds"
redis_reply=$(docker compose exec -T redis redis-cli ping 2>/dev/null | tr -d '[:space:]')
[ "$redis_reply" = "PONG" ]
check "PING" "${redis_reply:-no reply}" $?

echo ""
echo "Migrations are applied and in sync"
migrate_out=$(docker compose exec -T backend npx prisma migrate status 2>&1)
echo "$migrate_out" | grep -q "Database schema is up to date"
check "prisma migrate status" "schema in sync with migrations" $?

echo ""
echo "Health endpoints"
api_health=$(curl -fsS "http://localhost:${BACKEND_PORT:-4000}/health" 2>/dev/null)
echo "$api_health" | grep -q '"status":"ok"'
check "API /health" "postgres + redis up" $?

fe_health=$(curl -fsS "http://localhost:${FRONTEND_PORT:-3000}/health" 2>/dev/null)
echo "$fe_health" | grep -q '"status":"ok"'
check "frontend /health" "serving" $?

echo ""
echo "Seed data covers every entity type"
seeded=$(docker compose exec -T postgres psql -U "${POSTGRES_USER:-cargotrack}" \
  -d "${POSTGRES_DB:-cargotrack}" -tAc "
  SELECT count(*) FROM (
    SELECT 1 FROM users LIMIT 1) a
  WHERE (SELECT count(*) FROM clients) > 0
    AND (SELECT count(*) FROM orders) > 0
    AND (SELECT count(*) FROM containers) > 0
    AND (SELECT count(*) FROM container_allocations) > 0
    AND (SELECT count(*) FROM documents) > 0
    AND (SELECT count(*) FROM payments) > 0
    AND (SELECT count(*) FROM notifications) > 0
    AND (SELECT count(*) FROM status_history) > 0;" 2>/dev/null | tr -d '[:space:]')

[ "$seeded" = "1" ]
check "demo data loaded" "core tables populated" $?

echo ""
echo "---------------------------------------------------------------"
printf '  %d passed, %d failed\n' "$pass" "$fail"
echo "---------------------------------------------------------------"

if [ "$fail" -eq 0 ]; then
  echo "  GATE 1 MET"
  exit 0
fi

echo "  GATE 1 NOT MET"
exit 1
