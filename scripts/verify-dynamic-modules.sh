#!/usr/bin/env bash
# Phase 3 acceptance suite — the dynamic module engine over HTTP against :3000.
#
#   bash scripts/verify-dynamic-modules.sh
#
# Proves, on a freshly created module each run:
#   module register → module create (with its starter form) → settings update →
#   second form → structure save (sections / fields / options / tables / formulas)
#   → publish guards → form publish → module publish (unfinished forms reported
#   and skipped) → access matrix → clone → archive → delete · auditor catalogue →
#   start (and resume) → draft with live score → server-side formula → incomplete
#   submit refused with field-level errors → signature upload → submit → PDF ·
#   verifier queue → read-only review → approve → decision visible to the
#   submitter → PDF re-rendered · activity log + emails · every admin / auditor /
#   verifier page · cross-panel authorisation.
set -u
BASE=${BASE:-http://127.0.0.1:3001}

if ! curl -s -o /dev/null "$BASE/api/health"; then
  echo "The app is not answering on $BASE — start it with: npm start" >&2
  exit 1
fi

python3 scripts/verify-dynamic-modules.py
