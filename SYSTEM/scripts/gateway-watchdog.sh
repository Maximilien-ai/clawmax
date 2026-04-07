#!/bin/sh
set -eu

LOG_DIR="${HOME}/.openclaw/logs"
LOG_FILE="${LOG_DIR}/gateway-watchdog.log"

mkdir -p "$LOG_DIR"

timestamp() {
  date '+%Y-%m-%dT%H:%M:%S%z'
}

log() {
  printf '%s %s\n' "$(timestamp)" "$1" >> "$LOG_FILE"
}

if ! command -v openclaw >/dev/null 2>&1; then
  log "[watchdog] openclaw CLI not found; skipping"
  exit 0
fi

if openclaw gateway status >/dev/null 2>&1; then
  exit 0
fi

log "[watchdog] gateway down; attempting restart"
if openclaw gateway restart >> "$LOG_FILE" 2>&1; then
  log "[watchdog] gateway restart requested"
else
  log "[watchdog] gateway restart failed"
fi
