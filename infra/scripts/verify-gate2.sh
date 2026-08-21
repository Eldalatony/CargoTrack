#!/usr/bin/env bash
# Gate 2 — order lifecycle covered.
#
#   "A full order can be walked from Order Placed to Closed Out via API calls
#    alone. All 8 states transition correctly. An invalid transition is
#    rejected with a clear error. STATUS_HISTORY is populated at every step."
#
# Gates are verified by running the scenario, not by inspection. Everything
# below goes through the HTTP API with a bearer token — nothing writes to
# Postgres to move the order along, because an order walked with SQL proves
# nothing about the API.
#
#   ./infra/scripts/verify-gate2.sh
#
# The run creates its own client, supplier and order, and removes them again
# at both ends so it is safe to repeat. Demo data is left untouched.

set -uo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

API="http://localhost:${BACKEND_PORT:-4000}"
MANAGER_EMAIL="manager@cargotrack.example"
CLIENT_EMAIL="hassan@niletrading.example"
DEMO_PASSWORD="CargoTrack!2026"
MARKER="Gate 2 Verification"

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

# --------------------------------------------------------------------------
# Plumbing
# --------------------------------------------------------------------------

# jq if the host has it, otherwise node inside the backend container — the
# stack has to be up for this script to mean anything, so it is always there.
if command -v jq >/dev/null 2>&1; then
  # .0.fromStatus is how the paths below read; jq wants .[0].fromStatus.
  json() { jq -r "$(printf '%s' "$1" | sed -E 's/\.([0-9]+)/.[\1]/g')"; }
else
  json() {
    docker compose exec -T backend node -e '
      let raw = "";
      process.stdin.on("data", (d) => (raw += d)).on("end", () => {
        const body = JSON.parse(raw || "null");
        const expr = process.argv[1];
        if (expr === "length") return console.log(Array.isArray(body) ? body.length : 0);
        const value = expr.split(".").reduce((acc, key) => {
          if (acc == null) return acc;
          const index = Number(key);
          return Number.isInteger(index) ? acc[index] : acc[key];
        }, body);
        console.log(value === undefined || value === null ? "null" : value);
      });
    ' "${1#.}"
  }
fi

BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT

# Runs a request and prints its status code; the body lands in $BODY_FILE.
# Usage: code=$(api GET /api/orders "$TOKEN" [json-body])
api() {
  local method="$1" path="$2" token="${3:-}" payload="${4:-}"
  local args=(-s -o "$BODY_FILE" -w '%{http_code}' -X "$method" "${API}${path}")

  [ -n "$token" ] && args+=(-H "Authorization: Bearer ${token}")

  if [ -n "$payload" ]; then
    args+=(-H 'Content-Type: application/json' -d "$payload")
  fi

  curl "${args[@]}"
}

body() { cat "$BODY_FILE"; }
field() { body | json ".$1"; }

expect_code() {
  local label="$1" expected="$2" actual="$3"

  [ "$actual" = "$expected" ]
  check "$label" "HTTP $actual (expected $expected)" $?
}

# Removes anything a previous run left behind. Children before parents.
cleanup() {
  docker compose exec -T postgres psql -U "${POSTGRES_USER:-cargotrack}" \
    -d "${POSTGRES_DB:-cargotrack}" -q >/dev/null 2>&1 <<SQL
DELETE FROM status_history WHERE entity_id IN (
  SELECT id FROM orders WHERE client_id IN (SELECT id FROM clients WHERE company_name LIKE '${MARKER}%')
  UNION ALL
  SELECT id FROM production_orders WHERE order_id IN (
    SELECT id FROM orders WHERE client_id IN (SELECT id FROM clients WHERE company_name LIKE '${MARKER}%'))
);
DELETE FROM qc_inspections WHERE production_order_id IN (
  SELECT id FROM production_orders WHERE order_id IN (
    SELECT id FROM orders WHERE client_id IN (SELECT id FROM clients WHERE company_name LIKE '${MARKER}%')));
DELETE FROM production_orders WHERE order_id IN (
  SELECT id FROM orders WHERE client_id IN (SELECT id FROM clients WHERE company_name LIKE '${MARKER}%'));
DELETE FROM order_items WHERE order_id IN (
  SELECT id FROM orders WHERE client_id IN (SELECT id FROM clients WHERE company_name LIKE '${MARKER}%'));
DELETE FROM orders WHERE client_id IN (SELECT id FROM clients WHERE company_name LIKE '${MARKER}%');
DELETE FROM clients WHERE company_name LIKE '${MARKER}%';
DELETE FROM suppliers WHERE name LIKE '${MARKER}%';
SQL
}

# --------------------------------------------------------------------------

echo ""
echo "Gate 2 — order lifecycle covered"
echo "================================"
echo ""

if ! curl -fsS "${API}/health" >/dev/null 2>&1; then
  echo "  The API is not answering at ${API}. Start the stack first:"
  echo ""
  echo "      docker compose up -d"
  echo ""
  exit 1
fi

cleanup

echo "Authentication"
code=$(api POST /api/auth/login "" "{\"email\":\"${MANAGER_EMAIL}\",\"password\":\"${DEMO_PASSWORD}\"}")
expect_code "office manager logs in" 200 "$code"
MANAGER_TOKEN=$(field accessToken)

code=$(api POST /api/auth/login "" "{\"email\":\"${CLIENT_EMAIL}\",\"password\":\"${DEMO_PASSWORD}\"}")
expect_code "client logs in" 200 "$code"
CLIENT_TOKEN=$(field accessToken)

code=$(api POST /api/auth/login "" "{\"email\":\"${MANAGER_EMAIL}\",\"password\":\"wrong\"}")
expect_code "wrong password is refused" 401 "$code"

code=$(api GET /api/orders "")
expect_code "no token is refused" 401 "$code"

echo ""
echo "Fixtures"
code=$(api POST /api/clients "$MANAGER_TOKEN" "{
  \"companyName\": \"${MARKER} Co.\",
  \"contactName\": \"Gate Two\",
  \"email\": \"gate2@cargotrack.test\",
  \"country\": \"Egypt\"
}")
expect_code "create client" 201 "$code"
CLIENT_ID=$(field id)

code=$(api POST /api/suppliers "$MANAGER_TOKEN" "{
  \"name\": \"${MARKER} Supplier\",
  \"country\": \"China\"
}")
expect_code "create supplier" 201 "$code"
SUPPLIER_ID=$(field id)

echo ""
echo "1. Order Placed"
code=$(api POST /api/orders "$MANAGER_TOKEN" "{
  \"clientId\": \"${CLIENT_ID}\",
  \"agreedPrice\": 24000,
  \"currency\": \"USD\",
  \"depositPercentage\": 20,
  \"items\": [{
    \"description\": \"Rattan dining chairs\",
    \"quantity\": 120,
    \"unitCbm\": 0.085,
    \"unitWeightKg\": 4.2,
    \"unitPrice\": 150
  }]
}")
expect_code "place order" 201 "$code"
ORDER_ID=$(field id)

status=$(field status)
[ "$status" = "ORDER_PLACED" ]
check "starts at ORDER_PLACED" "$status" $?

total_cbm=$(field totalCbm)
awk -v v="$total_cbm" 'BEGIN { exit !(v + 0 > 10.19 && v + 0 < 10.21) }'
check "CBM derived from items" "120 x 0.085 = ${total_cbm}" $?

echo ""
echo "An invalid transition is rejected"
code=$(api POST "/api/orders/${ORDER_ID}/status" "$MANAGER_TOKEN" '{"status":"IN_TRANSIT"}')
expect_code "ORDER_PLACED -> IN_TRANSIT" 422 "$code"

# $? has to be captured before the command substitution below resets it.
body | grep -q "Valid transitions from ORDER_PLACED"
names_targets=$?
message=$(body | json .message | cut -c1-58)
check "error names the legal targets" "${message}…" $names_targets

code=$(api POST "/api/orders/${ORDER_ID}/status" "$MANAGER_TOKEN" '{"status":"NOT_A_STATUS"}')
expect_code "a status that is not a status" 400 "$code"

code=$(api PATCH "/api/orders/${ORDER_ID}" "$MANAGER_TOKEN" '{"status":"CLOSED_OUT"}')
expect_code "status is not a PATCH field" 400 "$code"

echo ""
echo "2. Order Confirmed, then production and QC"
code=$(api POST "/api/orders/${ORDER_ID}/status" "$MANAGER_TOKEN" '{"status":"ORDER_CONFIRMED"}')
expect_code "ORDER_PLACED -> ORDER_CONFIRMED" 200 "$code"

code=$(api POST /api/production-orders "$MANAGER_TOKEN" "{
  \"orderId\": \"${ORDER_ID}\",
  \"supplierId\": \"${SUPPLIER_ID}\",
  \"agreedCost\": 9000,
  \"currency\": \"CNY\"
}")
expect_code "place production order" 201 "$code"
BATCH_ID=$(field id)

for batch_status in IN_PRODUCTION READY RECEIVED; do
  code=$(api POST "/api/production-orders/${BATCH_ID}/status" "$MANAGER_TOKEN" \
    "{\"status\":\"${batch_status}\"}")
  expect_code "production -> ${batch_status}" 200 "$code"
done

code=$(api POST "/api/orders/${ORDER_ID}/status" "$MANAGER_TOKEN" '{"status":"GOODS_RECEIVED"}')
expect_code "ORDER_CONFIRMED -> GOODS_RECEIVED" 200 "$code"

# The hard rule: no signature, no shipment.
code=$(api POST "/api/orders/${ORDER_ID}/status" "$MANAGER_TOKEN" '{"status":"SHIPMENT_BOOKING"}')
expect_code "booking blocked before QC sign-off" 422 "$code"

code=$(api POST /api/qc-inspections "$MANAGER_TOKEN" "{
  \"productionOrderId\": \"${BATCH_ID}\",
  \"inspectedAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
  \"outcome\": \"PASSED\"
}")
expect_code "record QC inspection" 201 "$code"
INSPECTION_ID=$(field id)

code=$(api PATCH "/api/qc-inspections/${INSPECTION_ID}/sign-off" "$MANAGER_TOKEN" '{}')
expect_code "client signs the QC sheet" 200 "$code"

echo ""
echo "3. The rest of the walk to Closed Out"
for next_status in SHIPMENT_BOOKING ROUTE_DECISION IN_TRANSIT DELIVERED CLOSED_OUT; do
  code=$(api POST "/api/orders/${ORDER_ID}/status" "$MANAGER_TOKEN" \
    "{\"status\":\"${next_status}\"}")
  expect_code "-> ${next_status}" 200 "$code"
done

code=$(api GET "/api/orders/${ORDER_ID}" "$MANAGER_TOKEN")
status=$(field status)
[ "$status" = "CLOSED_OUT" ]
check "order is CLOSED_OUT" "$status" $?

closed_at=$(field closedAt)
[ -n "$closed_at" ] && [ "$closed_at" != "null" ]
check "closed_at stamped" "$closed_at" $?

code=$(api POST "/api/orders/${ORDER_ID}/status" "$MANAGER_TOKEN" '{"status":"IN_TRANSIT"}')
expect_code "CLOSED_OUT is terminal" 422 "$code"

echo ""
echo "STATUS_HISTORY is populated at every step"
code=$(api GET "/api/orders/${ORDER_ID}/status-history" "$MANAGER_TOKEN")
expect_code "read the audit trail" 200 "$code"

rows=$(body | json length)
[ "$rows" = "8" ]
check "one row for placement + 7 transitions" "${rows} rows" $?

first_from=$(body | json .0.fromStatus)
[ "$first_from" = "null" ]
check "trail opens with from_status NULL" "$first_from" $?

last_to=$(body | json .7.toStatus)
[ "$last_to" = "CLOSED_OUT" ]
check "trail ends at CLOSED_OUT" "$last_to" $?

changed_by=$(body | json .3.changedBy)
[ -n "$changed_by" ] && [ "$changed_by" != "null" ]
check "every change is attributed" "changed_by recorded" $?

# The chain has no holes: row N starts where row N-1 ended.
chain_ok=0
for index in 1 2 3 4 5 6 7; do
  previous=$((index - 1))
  [ "$(body | json ".${index}.fromStatus")" = "$(body | json ".${previous}.toStatus")" ] || chain_ok=1
done
check "each row starts where the last ended" "no gaps in the chain" $chain_ok

echo ""
echo "Client scoping"
code=$(api GET "/api/orders/${ORDER_ID}" "$CLIENT_TOKEN")
expect_code "another client order is invisible" 404 "$code"

code=$(api GET "/api/orders/${ORDER_ID}/status-history" "$CLIENT_TOKEN")
expect_code "its history is invisible too" 404 "$code"

code=$(api POST /api/orders "$CLIENT_TOKEN" "{
  \"clientId\": \"${CLIENT_ID}\",
  \"agreedPrice\": 100,
  \"currency\": \"USD\"
}")
expect_code "a client cannot place orders" 403 "$code"

code=$(api GET /api/suppliers "$CLIENT_TOKEN")
expect_code "a client cannot list suppliers" 403 "$code"

cleanup

echo ""
echo "---------------------------------------------------------------"
printf '  %d passed, %d failed\n' "$pass" "$fail"
echo "---------------------------------------------------------------"

if [ "$fail" -eq 0 ]; then
  echo "  GATE 2 MET"
  exit 0
fi

echo "  GATE 2 NOT MET"
exit 1
