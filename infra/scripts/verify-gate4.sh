#!/usr/bin/env bash
# Gate 4 — business rules verified.
#
#   "Document withholding gate proven by an automated test that cannot be
#    disabled. Deposit recorded on confirmation. Balance payment triggers
#    release. The retry pipeline correctly cycles through failure, retry, and
#    dead-letter states."
#
# Same rules as Gates 2 and 3: everything goes through the HTTP API with a
# bearer token, against the running stack. The retry section waits for the
# real worker to exhaust its real backoff (5s, 10s, 20s, 40s), so a full run
# takes about a minute and a half.
#
#   ./infra/scripts/verify-gate4.sh
#
# The run creates its own clients, users, supplier, orders and documents, and
# removes them again at both ends so it is safe to repeat.

set -uo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

API="http://localhost:${BACKEND_PORT:-4000}"
MANAGER_EMAIL="manager@cargotrack.example"
DEMO_PASSWORD="CargoTrack!2026"
MARKER="Gate 4 Verification"
CLIENT_USER_EMAIL="gate4-client@cargotrack.test"
STORAGE="${FILE_STORAGE_PATH:-/app/storage}"

pass=0
fail=0

check() {
  local label="$1"
  local detail="${2:-}"
  local ok="$3"

  if [ "$ok" = "0" ]; then
    printf '  [ PASS ] %-52s %s\n' "$label" "$detail"
    pass=$((pass + 1))
  else
    printf '  [ FAIL ] %-52s %s\n' "$label" "$detail"
    fail=$((fail + 1))
  fi
}

# --------------------------------------------------------------------------
# Plumbing
# --------------------------------------------------------------------------

if command -v jq >/dev/null 2>&1; then
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
DOWNLOAD_FILE="$(mktemp)"
# Relative, not mktemp: curl's -F file=@<path> is not path-translated under
# Git Bash on Windows, so a /tmp path is unreadable to it there.
PDF_FILE=".gate4-upload-$$.pdf"
trap 'rm -f "$BODY_FILE" "$PDF_FILE" "$DOWNLOAD_FILE"' EXIT

SECRET="GATE4-WITHHELD-$(date +%s)"
printf '%%PDF-1.4 %s\n' "$SECRET" >"$PDF_FILE"

api() {
  local method="$1" path="$2" token="${3:-}" payload="${4:-}"
  local args=(-s -o "$BODY_FILE" -w '%{http_code}' -X "$method" "${API}${path}")

  [ -n "$token" ] && args+=(-H "Authorization: Bearer ${token}")

  if [ -n "$payload" ]; then
    args+=(-H 'Content-Type: application/json' -d "$payload")
  fi

  curl "${args[@]}"
}

# Multipart upload. Usage: code=$(upload <path> <token> field=value ...)
upload() {
  local path="$1" token="$2"
  shift 2
  local args=(-s -o "$BODY_FILE" -w '%{http_code}' -X POST "${API}${path}"
    -H "Authorization: Bearer ${token}" -F "file=@${PDF_FILE};type=application/pdf")

  for pair in "$@"; do
    args+=(-F "$pair")
  done

  curl "${args[@]}"
}

body() { cat "$BODY_FILE"; }
field() { body | json ".$1"; }
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

expect_code() {
  local label="$1" expected="$2" actual="$3"

  [ "$actual" = "$expected" ]
  check "$label" "HTTP $actual (expected $expected)" $?
}

# verify <label> <detail> '<condition>'
#
# The condition is evaluated in here, after the arguments have expanded.
# Writing `[ … ]; check "…" "$(field x)" $?` instead reports the exit status
# of the $(…) in the detail — always 0 — and every such check passes.
verify() {
  local label="$1" detail="$2"
  eval "$3"
  check "$label" "$detail" $?
}

present() { [ -n "$1" ] && [ "$1" != "null" ]; }

# Runs a command in the backend container. MSYS_NO_PATHCONV stops Git Bash on
# Windows from rewriting /app/storage/… into C:/Program Files/Git/app/…
# before docker ever sees it; elsewhere the variable is simply ignored.
in_backend() {
  MSYS_NO_PATHCONV=1 docker compose exec -T backend "$@"
}

sql() {
  docker compose exec -T postgres psql -U "${POSTGRES_USER:-cargotrack}" \
    -d "${POSTGRES_DB:-cargotrack}" -At -c "$1" 2>/dev/null
}

CLIENTS="SELECT id FROM clients WHERE company_name LIKE '${MARKER}%'"
ORDERS="SELECT id FROM orders WHERE client_id IN (${CLIENTS})"

# Removes anything a previous run left behind, stored files included.
cleanup() {
  local refs
  refs=$(sql "SELECT file_ref FROM documents WHERE order_id IN (${ORDERS})
              UNION ALL SELECT file_ref FROM client_documents WHERE client_id IN (${CLIENTS})")

  for ref in $refs; do
    in_backend rm -f "${STORAGE}/${ref}" >/dev/null 2>&1
  done

  docker compose exec -T postgres psql -U "${POSTGRES_USER:-cargotrack}" \
    -d "${POSTGRES_DB:-cargotrack}" -q >/dev/null 2>&1 <<SQL
CREATE TEMP TABLE gate_entities AS
  ${ORDERS}
  UNION ALL SELECT id FROM production_orders WHERE order_id IN (${ORDERS})
  UNION ALL SELECT id FROM payments WHERE order_id IN (${ORDERS})
  UNION ALL SELECT id FROM documents WHERE order_id IN (${ORDERS});
DELETE FROM status_history WHERE entity_id IN (SELECT id FROM gate_entities);
DELETE FROM notifications WHERE entity_id IN (SELECT id FROM gate_entities)
  OR recipient_id IN (${CLIENTS});
DELETE FROM qc_inspections WHERE production_order_id IN (
  SELECT id FROM production_orders WHERE order_id IN (${ORDERS}));
DELETE FROM production_orders WHERE order_id IN (${ORDERS});
DELETE FROM order_items WHERE order_id IN (${ORDERS});
DELETE FROM orders WHERE client_id IN (${CLIENTS});
DELETE FROM users WHERE email = '${CLIENT_USER_EMAIL}';
DELETE FROM clients WHERE company_name LIKE '${MARKER}%';
DELETE FROM suppliers WHERE name LIKE '${MARKER}%';
SQL
}

move_order() {
  api POST "/api/orders/$1/status" "$MANAGER_TOKEN" "{\"status\":\"$2\"}"
}

place_order() {
  api POST /api/orders "$MANAGER_TOKEN" "{
    \"clientId\": \"$1\", \"agreedPrice\": 10000, \"currency\": \"USD\",
    \"items\": [{\"description\": \"Brass lanterns\", \"quantity\": 40,
      \"unitCbm\": 0.05, \"unitWeightKg\": 3, \"unitPrice\": 250}]
  }" >/dev/null
  field id
}

# Production received and QC signed off. Usage: produce <order-id>
produce() {
  local batch inspection

  api POST /api/production-orders "$MANAGER_TOKEN" "{
    \"orderId\": \"$1\", \"supplierId\": \"${SUPPLIER_ID}\",
    \"agreedCost\": 4000, \"currency\": \"CNY\"
  }" >/dev/null
  batch=$(field id)

  for s in IN_PRODUCTION READY RECEIVED; do
    api POST "/api/production-orders/${batch}/status" "$MANAGER_TOKEN" "{\"status\":\"${s}\"}" >/dev/null
  done

  api POST /api/qc-inspections "$MANAGER_TOKEN" "{
    \"productionOrderId\": \"${batch}\", \"inspectedAt\": \"$(now)\", \"outcome\": \"PASSED\"
  }" >/dev/null
  inspection=$(field id)
  api PATCH "/api/qc-inspections/${inspection}/sign-off" "$MANAGER_TOKEN" '{}' >/dev/null
}

# --------------------------------------------------------------------------

echo ""
echo "Gate 4 — business rules verified"
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

echo "Fixtures"
code=$(api POST /api/auth/login "" "{\"email\":\"${MANAGER_EMAIL}\",\"password\":\"${DEMO_PASSWORD}\"}")
expect_code "office manager logs in" 200 "$code"
MANAGER_TOKEN=$(field accessToken)

code=$(api POST /api/clients "$MANAGER_TOKEN" "{
  \"companyName\": \"${MARKER} Trading\", \"contactName\": \"Gate Four\",
  \"email\": \"gate4@cargotrack.test\", \"country\": \"Egypt\"
}")
expect_code "create client" 201 "$code"
CLIENT_ID=$(field id)

# RFC 2606 reserves .invalid: this mailbox can never exist, and the email
# provider bounces it the way a real one would.
code=$(api POST /api/clients "$MANAGER_TOKEN" "{
  \"companyName\": \"${MARKER} Bounce\", \"contactName\": \"Nobody Home\",
  \"email\": \"accounts@gate4-verify.invalid\", \"country\": \"Egypt\"
}")
expect_code "create a client whose mailbox cannot exist" 201 "$code"
BOUNCE_CLIENT_ID=$(field id)

code=$(api POST /api/users "$MANAGER_TOKEN" "{
  \"name\": \"Gate Four Client\", \"email\": \"${CLIENT_USER_EMAIL}\",
  \"password\": \"${DEMO_PASSWORD}\", \"role\": \"CLIENT\", \"clientId\": \"${CLIENT_ID}\"
}")
expect_code "create the client's portal login" 201 "$code"

code=$(api POST /api/auth/login "" "{\"email\":\"${CLIENT_USER_EMAIL}\",\"password\":\"${DEMO_PASSWORD}\"}")
expect_code "client logs in" 200 "$code"
CLIENT_TOKEN=$(field accessToken)

code=$(api POST /api/suppliers "$MANAGER_TOKEN" "{\"name\": \"${MARKER} Supplier\", \"country\": \"China\"}")
expect_code "create supplier" 201 "$code"
SUPPLIER_ID=$(field id)

# Placed now so the worker's backoff runs while the rest of the gate does.
BOUNCE_ORDER=$(place_order "$BOUNCE_CLIENT_ID")

echo ""
echo "1. Deposit recorded on confirmation"
ORDER_ID=$(place_order "$CLIENT_ID")

code=$(api POST "/api/orders/${ORDER_ID}/status" "$MANAGER_TOKEN" \
  '{"status":"ORDER_CONFIRMED","deposit":{"amount":2000,"reference":"DEP-GATE4"}}')
expect_code "confirm with the 20% deposit in the same call" 200 "$code"

code=$(api GET "/api/payments?orderId=${ORDER_ID}" "$MANAGER_TOKEN")
verify "the deposit is on the ledger, cleared" \
  "$(field data.0.paymentType) $(field data.0.amount) $(field data.0.currency)" \
  '[ "$(field data.0.paymentType)" = DEPOSIT ] && [ "$(field data.0.amount)" = 2000 ] && present "$(field data.0.paidAt)"'

UNPAID_ORDER=$(place_order "$CLIENT_ID")
move_order "$UNPAID_ORDER" ORDER_CONFIRMED >/dev/null
produce "$UNPAID_ORDER"

code=$(move_order "$UNPAID_ORDER" GOODS_RECEIVED)
expect_code "no deposit, no goods in" 422 "$code"
verify "refused by the deposit guard, by name" "guard: $(field guard)" \
  '[ "$(field guard)" = deposit ]'

echo ""
echo "2. Documents withheld while the balance is unpaid"
produce "$ORDER_ID"
for s in GOODS_RECEIVED SHIPMENT_BOOKING ROUTE_DECISION IN_TRANSIT DELIVERED; do
  move_order "$ORDER_ID" "$s" >/dev/null
done
code=$(api GET "/api/orders/${ORDER_ID}" "$MANAGER_TOKEN")
verify "order delivered" "$(field status)" '[ "$(field status)" = DELIVERED ]'

code=$(upload /api/documents "$MANAGER_TOKEN" docType=BILL_OF_LADING "orderId=${ORDER_ID}")
expect_code "upload the bill of lading" 201 "$code"
DOC_ID=$(field id)
FILE_REF=$(field fileRef)

code=$(api POST /api/payments "$MANAGER_TOKEN" \
  "{\"orderId\":\"${ORDER_ID}\",\"paymentType\":\"BALANCE\",\"amount\":8000,\"currency\":\"USD\"}")
expect_code "raise the 8,000 balance invoice" 201 "$code"
INVOICE_ID=$(field id)

code=$(api GET "/api/documents/${DOC_ID}" "$MANAGER_TOKEN")
verify "the office sees the file_ref" "${FILE_REF}" \
  'present "$FILE_REF" && [ "$(field fileRef)" = "$FILE_REF" ]'

code=$(api GET "/api/documents/${DOC_ID}" "$CLIENT_TOKEN")
expect_code "client reads the document" 200 "$code"
verify "file_ref absent from the response entirely" "no fileRef key" \
  '[ "$code" = 200 ] && ! body | grep -q "\"fileRef\""'
verify "visibly withheld, with the reason" "$(field withheldReason)" \
  '[ "$(field withheld)" = true ] && field withheldReason | grep -q "8000.00 USD outstanding"'

code=$(api GET "/api/documents?orderId=${ORDER_ID}" "$CLIENT_TOKEN")
verify "absent from the list as well" "$(field meta.total) document(s), no fileRef" \
  '[ "$(field meta.total)" = 1 ] && ! body | grep -q "$FILE_REF"'

code=$(curl -s -o "$DOWNLOAD_FILE" -w '%{http_code}' -H "Authorization: Bearer ${CLIENT_TOKEN}" \
  "${API}/api/documents/${DOC_ID}/file")
expect_code "download refused" 403 "$code"
verify "not one byte of the file served" "" '! grep -q "$SECRET" "$DOWNLOAD_FILE"'

code=$(move_order "$ORDER_ID" CLOSED_OUT)
expect_code "cannot close out owing money" 422 "$code"
verify "refused by the balance guard, by name" "guard: $(field guard)" \
  '[ "$(field guard)" = balance ]'

code=$(api POST "/api/orders/${ORDER_ID}/status" "$MANAGER_TOKEN" \
  '{"status":"DOCUMENTS_WITHHELD","reason":"Balance not received within terms"}')
expect_code "-> DOCUMENTS_WITHHELD" 200 "$code"

echo ""
echo "3. Balance payment triggers release"
code=$(api POST "/api/payments/${INVOICE_ID}/paid" "$MANAGER_TOKEN" '{"reference":"TT-GATE4"}')
expect_code "the balance clears" 200 "$code"

code=$(api GET "/api/orders/${ORDER_ID}" "$MANAGER_TOKEN")
verify "the order closed out on its own" "DOCUMENTS_WITHHELD -> $(field status)" \
  '[ "$(field status)" = CLOSED_OUT ]'

code=$(api GET "/api/documents/${DOC_ID}" "$CLIENT_TOKEN")
verify "the client now gets the file_ref" "$(field fileRef)" \
  'present "$FILE_REF" && [ "$(field fileRef)" = "$FILE_REF" ]'
verify "released_to_client_at stamped" "$(field releasedToClientAt)" \
  'present "$(field releasedToClientAt)"'

code=$(curl -s -o "$DOWNLOAD_FILE" -w '%{http_code}' -H "Authorization: Bearer ${CLIENT_TOKEN}" \
  "${API}/api/documents/${DOC_ID}/file")
expect_code "download allowed" 200 "$code"
verify "the client receives the file" "" 'grep -q "$SECRET" "$DOWNLOAD_FILE"'

code=$(api GET "/api/documents/${DOC_ID}/status-history" "$MANAGER_TOKEN")
verify "release recorded in the document history" \
  "$(field 1.fromStatus) -> $(field 1.toStatus)" \
  '[ "$(field 1.fromStatus)" = WITHHELD ] && [ "$(field 1.toStatus)" = RELEASED ]'

echo ""
echo "4. The automated test that proves the gate"
docker compose exec -T backend npx jest src/modules/documents >/dev/null 2>&1
check "gate unit tests, and the guard against skipping them" "npm test" $?

docker compose exec -T backend npx jest --config ./test/jest-e2e.json \
  document-release-gate >"$BODY_FILE" 2>&1
e2e=$?
summary=$(grep -E '^Tests:' "$BODY_FILE" | sed 's/Tests: *//')
check "gate e2e suite incl. the every-GET-route sweep" "${summary:-did not run}" $e2e

echo ""
echo "5. Retry pipeline: failure, retry, dead letter"
code=$(api GET "/api/notifications?entityId=${ORDER_ID}&limit=100" "$MANAGER_TOKEN")
sent=$(body | grep -o '"status":"SENT"' | wc -l | tr -d ' ')
verify "deliverable notifications were SENT" "${sent} sent for the order" \
  '[ "$sent" -gt 0 ]'

echo "         waiting for the worker to exhaust 5 attempts (5s/10s/20s/40s backoff)…"
seen=""
final=""
for _ in $(seq 1 75); do
  api GET "/api/notifications?entityId=${BOUNCE_ORDER}" "$MANAGER_TOKEN" >/dev/null
  status=$(field data.0.status)
  retries=$(field data.0.retryCount)

  case " ${seen} " in
    *" ${status}:${retries} "*) ;;
    *)
      seen="${seen} ${status}:${retries}"
      printf '         … %-12s retry_count %s\n' "$status" "$retries"
      ;;
  esac

  if [ "$status" = "DEAD_LETTER" ]; then
    final="$status"
    break
  fi
  sleep 2
done

case "$seen" in *FAILED*) true ;; *) false ;; esac
check "failed attempts are retried" "FAILED seen between attempts" $?

[ "$final" = "DEAD_LETTER" ]
check "dead-lettered after the final attempt" "${final:-still ${status}}" $?

verify "retry_count records all 5 attempts" "$(field data.0.retryCount)" \
  '[ "$(field data.0.retryCount)" = 5 ]'
verify "last_error kept" "$(field data.0.lastError)" \
  'field data.0.lastError | grep -q "Mailbox unreachable"'
DEAD_ID=$(field data.0.id)

code=$(api GET "/api/notifications?status=DEAD_LETTER&limit=100" "$MANAGER_TOKEN")
verify "surfaces in the dashboard's failed-jobs view" "status=DEAD_LETTER" \
  'present "$DEAD_ID" && body | grep -q "$DEAD_ID"'

code=$(api POST "/api/notifications/${DEAD_ID}/retry" "$MANAGER_TOKEN")
expect_code "the office can re-queue it" 200 "$code"
verify "back to PENDING with a fresh budget" \
  "$(field status), retry_count $(field retryCount)" \
  '[ "$(field status)" = PENDING ] && [ "$(field retryCount)" = 0 ]'

code=$(api GET /api/notifications/summary "$CLIENT_TOKEN")
expect_code "the dashboard is the office's alone" 403 "$code"

echo ""
echo "6. Client document retention"
code=$(upload "/api/clients/${CLIENT_ID}/documents" "$MANAGER_TOKEN" \
  docType=PASSPORT_SCAN "retentionExpiresAt=$(date -u -d '-1 day' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-1d +%Y-%m-%dT%H:%M:%SZ)")
expect_code "a passport scan past its retention date" 201 "$code"
PASSPORT_ID=$(field id)
PASSPORT_REF=$(sql "SELECT file_ref FROM client_documents WHERE id = '${PASSPORT_ID}'")

code=$(api POST /api/client-documents/retention/run "$MANAGER_TOKEN")
expect_code "run the retention sweep" 200 "$code"
verify "expired references removed" "$(field purged) purged" \
  '[ "$(field purged)" -ge 1 ]'

remaining=$(sql "SELECT count(*) FROM client_documents WHERE id = '${PASSPORT_ID}'")
verify "the reference is gone" "${remaining} row(s) left" \
  'present "$PASSPORT_ID" && [ "$remaining" = 0 ]'

verify "the stored file is not" "${PASSPORT_REF}" \
  'present "$PASSPORT_REF" && in_backend test -f "${STORAGE}/${PASSPORT_REF}"'
in_backend rm -f "${STORAGE}/${PASSPORT_REF}" >/dev/null 2>&1

cleanup

echo ""
echo "---------------------------------------------------------------"
printf '  %d passed, %d failed\n' "$pass" "$fail"
echo "---------------------------------------------------------------"

if [ "$fail" -eq 0 ]; then
  echo "  GATE 4 MET"
  exit 0
fi

echo "  GATE 4 NOT MET"
exit 1
