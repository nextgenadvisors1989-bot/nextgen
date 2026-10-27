#!/usr/bin/env bash
# Employer & employee self-service verification (Phase 2, final gap).
# Thin wrapper so the suite is runnable as `npm run verify:selfservice`.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/verify-selfservice.py "${1:-http://localhost:3001}"
