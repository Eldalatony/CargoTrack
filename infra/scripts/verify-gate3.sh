#!/usr/bin/env bash
# Gate 3 — shipping lifecycle covered.
#
#   "A container can be opened, allocated orders in a consolidated scenario,
#    departed, optionally transited, arrived, and closed — but only after all
#    allocated orders have closed. Capacity guard is tested at the boundary
#    value."
#
# Same rules as Gate 2: everything goes through the HTTP API with a bearer
# token. Two clients' orders are walked to SHIPMENT_BOOKING, consolidated
# into one transit container that they fill to exactly 100%, and the
# container is sailed, transited, arrived and closed.
#
#   ./infra/scripts/verify-gate3.sh
#
# The run creates its own clients, supplier, orders and container, and
# removes them again at both ends so it is safe to repeat.

set -uo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

API="http://localhost:${BACKEND_PORT:-4000}"
MANAGER_EMAIL="manager@cargotrack.example"
CLIENT_EMAIL="hassan@niletrading.example"
DEMO_PASSWORD="CargoTrack!2026"
MARKER="Gate 3 Verification"
CONTAINER_REF="GATE3-VERIFY-01"

pass=0
fail=0

check() {
  local label="$1"
  local detail="${2:-}"
  local ok="$3"

  if [ "$ok" = "0" ]; then
    printf '  [ PASS ] %-50s %s\n' "$label" "$detail"
    pass=$((pass + 1))
  else
    printf '  [ FAIL ] %-50s %s\n' "$label" "$detail"
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


# Removes anything a previous run left behind. Children before parents;
# allocations and transit legs cascade with the container.
cleanup() {
  docker compose exec -T postgres psql -U "${POSTGRES_USER:-cargotrack}" \
    -d "${POSTGRES_DB:-cargotrack}" -q >/dev/null 2>&1 <<SQL
CREATE TEMP TABLE gate_entities AS
  SELECT id FROM containers WHERE container_ref = '${CONTAINER_REF}'
  UNION ALL
  SELECT id FROM orders WHERE client_id IN (SELECT id FROM clients WHERE company_name LIKE '${MARKER}%')
  UNION ALL
  SELECT id FROM production_orders WHERE order_id IN (
    SELECT id FROM orders WHERE client_id IN (SELECT id FROM clients WHERE company_name LIKE '${MARKER}%'))
  UNION ALL
  SELECT id FROM payments WHERE order_id IN (
    SELECT id FROM orders WHERE client_id IN (SELECT id FROM clients WHERE company_name LIKE '${MARKER}%'));
DELETE FROM status_history WHERE entity_id IN (SELECT id FROM gate_entities);
DELETE FROM notifications WHERE entity_id IN (SELECT id FROM gate_entities)
  OR recipient_id IN (SELECT id FROM clients WHERE company_name LIKE '${MARKER}%');
DELETE FROM containers WHERE container_ref = '${CONTAINER_REF}';
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

move_order() {
  api POST "/api/orders/$1/status" "$MANAGER_TOKEN" "{\"status\":\"$2\"}"
}

# Walks a shipped order to CLOSED_OUT, clearing the 8,000 balance on
# delivery — close-out is payment-gated since Phase 4.
close_out_order() {
  local order="$1"

  for s in ROUTE_DECISION IN_TRANSIT DELIVERED; do
    move_order "$order" "$s" >/dev/null
  done

  api POST /api/payments "$MANAGER_TOKEN" \
    "{\"orderId\":\"${order}\",\"paymentType\":\"BALANCE\",\"amount\":8000,\"currency\":\"USD\",\"paidAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >/dev/null

  move_order "$order" CLOSED_OUT >/dev/null
}

move_container() {
  api POST "/api/containers/${CONTAINER_ID}/status" "$MANAGER_TOKEN" "{\"status\":\"$1\"}"
}

# Places an order for a client and walks it to SHIPMENT_BOOKING: confirmed,
# produced, received, QC passed and signed. Prints the order id.
# Usage: ready_order <client-id> <description> <qty> <unit-cbm> <unit-kg>
ready_order() {
  local client="$1" description="$2" quantity="$3" cbm="$4" kg="$5"
  local order batch inspection

  api POST /api/orders "$MANAGER_TOKEN" "{
    \"clientId\": \"${client}\", \"agreedPrice\": 10000, \"currency\": \"USD\",
    \"items\": [{\"description\": \"${description}\", \"quantity\": ${quantity},
      \"unitCbm\": ${cbm}, \"unitWeightKg\": ${kg}, \"unitPrice\": 100}]
  }" >/dev/null
  order=$(field id)

  # 20% of 10,000 taken on confirmation; goods-in waits for it (Phase 4).
  api POST "/api/orders/${order}/status" "$MANAGER_TOKEN" \
    '{"status":"ORDER_CONFIRMED","deposit":{"amount":2000}}' >/dev/null

  api POST /api/production-orders "$MANAGER_TOKEN" "{
    \"orderId\": \"${order}\", \"supplierId\": \"${SUPPLIER_ID}\",
    \"agreedCost\": 4000, \"currency\": \"CNY\"
  }" >/dev/null
  batch=$(field id)

  for s in IN_PRODUCTION READY RECEIVED; do
    api POST "/api/production-orders/${batch}/status" "$MANAGER_TOKEN" "{\"status\":\"${s}\"}" >/dev/null
  done

  api POST /api/qc-inspections "$MANAGER_TOKEN" "{
    \"productionOrderId\": \"${batch}\",
    \"inspectedAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"outcome\": \"PASSED\"
  }" >/dev/null
  inspection=$(field id)
  api PATCH "/api/qc-inspections/${inspection}/sign-off" "$MANAGER_TOKEN" '{}' >/dev/null

  move_order "$order" GOODS_RECEIVED >/dev/null
  move_order "$order" SHIPMENT_BOOKING >/dev/null

  printf '%s' "$order"
}

# --------------------------------------------------------------------------

echo ""
echo "Gate 3 — shipping lifecycle covered"
echo "==================================="
echo ""

if ! curl -fsS "${API}/health" >/dev/null 2>&1; then
  echo "  The API is not answering at ${API}. Start the stack first:"
  echo ""
  echo "      docker compose up -d"
  echo ""
  exit 1
fi

cleanup

echo "Fixtures"
code=$(api POST /api/auth/login "" "{\"email\":\"${MANAGER_EMAIL}\",\"password\":\"${DEMO_PASSWORD}\"}")
expect_code "office manager logs in" 200 "$code"
MANAGER_TOKEN=$(field accessToken)

code=$(api POST /api/auth/login "" "{\"email\":\"${CLIENT_EMAIL}\",\"password\":\"${DEMO_PASSWORD}\"}")
CLIENT_TOKEN=$(field accessToken)

for letter in A B; do
  code=$(api POST /api/clients "$MANAGER_TOKEN" "{
    \"companyName\": \"${MARKER} ${letter}\",
    \"contactName\": \"Gate Three\",
    \"email\": \"gate3-${letter}@cargotrack.test\",
    \"country\": \"Egypt\"
  }")
  expect_code "create client ${letter}" 201 "$code"
  eval "CLIENT_${letter}=\$(field id)"
done

code=$(api POST /api/suppliers "$MANAGER_TOKEN" "{\"name\": \"${MARKER} Supplier\", \"country\": \"China\"}")
expect_code "create supplier" 201 "$code"
SUPPLIER_ID=$(field id)

# 120 x 0.085 = 10.2 CBM and 98 x 0.1 = 9.8 CBM: together exactly 20.
ORDER_A=$(ready_order "$CLIENT_A" "Rattan dining chairs" 120 0.085 4.2)
ORDER_B=$(ready_order "$CLIENT_B" "Teak side tables" 98 0.1 12)

# The status goes into a variable first: a $(…) in check's arguments would
# run before $? is expanded and replace the result being reported.
code=$(api GET "/api/orders/${ORDER_A}" "$MANAGER_TOKEN")
status=$(field status)
[ "$status" = "SHIPMENT_BOOKING" ]
check "client A order ready to ship" "$status" $?
code=$(api GET "/api/orders/${ORDER_B}" "$MANAGER_TOKEN")
status=$(field status)
[ "$status" = "SHIPMENT_BOOKING" ]
check "client B order ready to ship" "$status" $?

echo ""
echo "1. Open for Allocation"
code=$(api POST /api/containers "$MANAGER_TOKEN" "{
  \"containerRef\": \"${CONTAINER_REF}\",
  \"containerType\": \"20GP\",
  \"capacityCbm\": 20,
  \"capacityWeightKg\": 5000,
  \"originPort\": \"Shanghai\",
  \"destinationPort\": \"Alexandria\",
  \"routeType\": \"TRANSIT\"
}")
expect_code "open a 20 CBM transit container" 201 "$code"
CONTAINER_ID=$(field id)

status=$(field status)
[ "$status" = "OPEN_FOR_ALLOCATION" ]
check "starts at OPEN_FOR_ALLOCATION" "$status" $?

echo ""
echo "Consolidated allocation and the capacity guard"
code=$(api POST "/api/containers/${CONTAINER_ID}/allocations" "$MANAGER_TOKEN" "{\"orderId\":\"${ORDER_A}\"}")
expect_code "allocate client A (10.2 CBM)" 201 "$code"

code=$(api POST "/api/containers/${CONTAINER_ID}/allocations" "$MANAGER_TOKEN" \
  "{\"orderId\":\"${ORDER_B}\",\"allocatedCbm\":9.801,\"allocatedWeightKg\":1176}")
expect_code "boundary + 0.001 CBM is rejected" 422 "$code"

body | grep -q "exceeds container capacity"
names_limit=$?
check "error says why" "$(body | json .message | cut -c1-54)…" $names_limit

code=$(api POST "/api/containers/${CONTAINER_ID}/allocations" "$MANAGER_TOKEN" "{\"orderId\":\"${ORDER_B}\"}")
expect_code "allocate client B (9.8 CBM) — exactly full" 201 "$code"

code=$(api GET "/api/containers/${CONTAINER_ID}" "$MANAGER_TOKEN")
percent=$(field utilization.cbmPercent)
[ "$percent" = "100" ]
check "utilization is exactly 100%" "${percent}%" $?

code=$(api GET "/api/containers/${CONTAINER_ID}/allocations" "$MANAGER_TOKEN")
first_client=$(body | json .0.order.client.id)
second_client=$(body | json .1.order.client.id)
[ "$first_client" != "$second_client" ]
check "two different clients share the box" "consolidated" $?

echo ""
echo "2–4. Fully Allocated, Departed, Transit, Arrived"
code=$(move_container FULLY_ALLOCATED)
expect_code "-> FULLY_ALLOCATED" 200 "$code"

code=$(api POST "/api/containers/${CONTAINER_ID}/allocations" "$MANAGER_TOKEN" \
  "{\"orderId\":\"${ORDER_A}\",\"allocatedCbm\":0.001,\"allocatedWeightKg\":0.001}")
expect_code "allocations locked after booking" 422 "$code"

code=$(move_container DEPARTED)
expect_code "transit route cannot sail with no stops" 422 "$code"

code=$(api POST "/api/containers/${CONTAINER_ID}/transit-legs" "$MANAGER_TOKEN" '{"port":"Jebel Ali"}')
expect_code "plan transit stop: Jebel Ali" 201 "$code"
LEG_ID=$(field id)

code=$(move_container DEPARTED)
expect_code "-> DEPARTED" 200 "$code"

code=$(move_container ARRIVED)
expect_code "cannot arrive with the stop unfinished" 422 "$code"

code=$(api POST "/api/containers/${CONTAINER_ID}/transit-legs/${LEG_ID}/departure" "$MANAGER_TOKEN" '{}')
expect_code "cannot leave a stop before reaching it" 422 "$code"

code=$(api POST "/api/containers/${CONTAINER_ID}/transit-legs/${LEG_ID}/arrival" "$MANAGER_TOKEN" '{}')
expect_code "arrive at Jebel Ali" 200 "$code"

code=$(api POST "/api/containers/${CONTAINER_ID}/transit-legs/${LEG_ID}/departure" "$MANAGER_TOKEN" '{}')
expect_code "depart Jebel Ali" 200 "$code"

code=$(move_container ARRIVED)
expect_code "-> ARRIVED" 200 "$code"

echo ""
echo "5. Closed — only after every allocated order has closed out"
code=$(move_container CLOSED)
expect_code "blocked: both orders still open" 422 "$code"

close_out_order "$ORDER_A"

code=$(move_container CLOSED)
expect_code "blocked: client B has not closed out" 422 "$code"

body | grep -q "$ORDER_B"
check "error names the open order" "${ORDER_B}" $?

close_out_order "$ORDER_B"

code=$(move_container CLOSED)
expect_code "-> CLOSED" 200 "$code"

code=$(move_container ARRIVED)
expect_code "CLOSED is terminal" 422 "$code"

echo ""
echo "STATUS_HISTORY is populated at every step"
code=$(api GET "/api/containers/${CONTAINER_ID}/status-history" "$MANAGER_TOKEN")
expect_code "read the audit trail" 200 "$code"

rows=$(body | json length)
[ "$rows" = "5" ]
check "one row per state" "${rows} rows" $?

first_from=$(body | json .0.fromStatus)
last_to=$(body | json .4.toStatus)
[ "$first_from" = "null" ] && [ "$last_to" = "CLOSED" ]
check "opens with NULL, ends at CLOSED" "${first_from} … ${last_to}" $?

chain_ok=0
for index in 1 2 3 4; do
  previous=$((index - 1))
  [ "$(body | json ".${index}.fromStatus")" = "$(body | json ".${previous}.toStatus")" ] || chain_ok=1
done
check "each row starts where the last ended" "no gaps in the chain" $chain_ok

echo ""
echo "Access"
code=$(api GET /api/containers "$CLIENT_TOKEN")
expect_code "a client cannot list containers" 403 "$code"

cleanup

echo ""
echo "---------------------------------------------------------------"
printf '  %d passed, %d failed\n' "$pass" "$fail"
echo "---------------------------------------------------------------"

if [ "$fail" -eq 0 ]; then
  echo "  GATE 3 MET"
  exit 0
fi

echo "  GATE 3 NOT MET"
exit 1
