#!/usr/bin/env bash
# Phase 4 (payroll & HR module) verification: probes the API, then runs the suite.
# Usage: bash scripts/verify-payroll.sh [base_url]
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="${1:-http://localhost:3001}"

printf '== Health probe (%s)\n' "$BASE"
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/health" || true)
  [ "$code" = "200" ] && break
  sleep 1
done
if [ "${code:-000}" != "200" ]; then
  echo "Server is not answering on $BASE (last status ${code:-000}). Start it with: npm run build && npm start" >&2
  exit 1
fi
echo "   /api/health 200"

printf '== Payroll suite\n'
python3 scripts/verify-payroll.py "$BASE"
