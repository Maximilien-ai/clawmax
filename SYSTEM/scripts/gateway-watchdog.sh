#!/bin/sh
set -eu

SYSTEM_DIR="$(cd "$(dirname "$0")/.." && pwd)"
. "$SYSTEM_DIR/openclaw-version.sh"
. "$SYSTEM_DIR/openclaw-cli.sh"

LOG_DIR="${HOME}/.openclaw/logs"
LOG_FILE="${LOG_DIR}/gateway-watchdog.log"

mkdir -p "$LOG_DIR"

timestamp() {
  date '+%Y-%m-%dT%H:%M:%S%z'
}

log() {
  printf '%s %s\n' "$(timestamp)" "$1" >> "$LOG_FILE"
}

if ! openclaw_cli_available; then
  log "[watchdog] openclaw CLI not found; skipping"
  exit 0
fi

if openclaw_cli_run gateway status >/dev/null 2>&1; then
  exit 0
fi

log "[watchdog] gateway down; attempting restart"
if openclaw_cli_run gateway restart >> "$LOG_FILE" 2>&1; then
  log "[watchdog] gateway restart requested"
else
  log "[watchdog] gateway restart failed"
fi
