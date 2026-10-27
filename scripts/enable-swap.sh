#!/usr/bin/env bash
# Bring the build swapfile up, creating it if the sandbox has lost it.
#
# A `next build` of this platform needs roughly 1.2 GB of heap, and without swap
# the build worker is killed (Next reports "build worker exited with code: null
# and signal: SIGKILL"). Sandbox restarts wipe both the running swap and the
# file, so `bootstrap-sandbox.sh` calls this on the way up.
#
# The file is deliberately kept out of the workspace snapshot's budget — it is
# 3 GB, well over the snapshot cap — so it is removed again once a build is
# done. Recreate it with this script whenever a build is needed:
#
#   bash scripts/enable-swap.sh
set -euo pipefail

SWAPFILE="${SWAPFILE:-/home/user/swapfile}"
SIZE="${SWAP_SIZE:-3G}"

# `swapon`/`mkswap` are not always on PATH; fall back to the absolute location.
swapon_cmd() { command -v swapon 2>/dev/null || echo /sbin/swapon; }
mkswap_cmd() { command -v mkswap 2>/dev/null || echo /sbin/mkswap; }
SWAPON="$(swapon_cmd)"

if "$SWAPON" --show 2>/dev/null | grep -q .; then
  echo "swap already on:"
  "$SWAPON" --show
  exit 0
fi

if [ ! -f "$SWAPFILE" ]; then
  echo "creating $SWAPFILE ($SIZE)"
  if ! fallocate -l "$SIZE" "$SWAPFILE" 2>/dev/null; then
    dd if=/dev/zero of="$SWAPFILE" bs=1M count=3072 status=none
  fi
  chmod 600 "$SWAPFILE"
  "$(mkswap_cmd)" "$SWAPFILE" >/dev/null 2>&1 || sudo -n "$(mkswap_cmd)" "$SWAPFILE" >/dev/null
fi

sudo -n "$SWAPON" "$SWAPFILE" 2>/dev/null || "$SWAPON" "$SWAPFILE"
"$SWAPON" --show
