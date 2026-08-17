#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
script_file="$repo_root/SYSTEM/ensure-openclaw-default-plugins.sh"
tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/clawmax-default-plugins.XXXXXX")"
trap 'rm -rf "$tmp_dir"' EXIT
log_file="$tmp_dir/openclaw.log"
fake_openclaw="$tmp_dir/openclaw"

cat > "$fake_openclaw" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${CLAWMAX_PLUGIN_TEST_LOG:?}"
if [ "${1:-}" = plugins ] && [ "${2:-}" = inspect ]; then
  exit "${CLAWMAX_PLUGIN_INSPECT_EXIT:-1}"
fi
EOF
chmod +x "$fake_openclaw"

CLAWMAX_PLUGIN_TEST_LOG="$log_file" OPENCLAW_BIN="$fake_openclaw" bash "$script_file" >/dev/null
grep -Fxq 'plugins install npm:@openclaw/whatsapp' "$log_file"
grep -Fxq 'plugins enable whatsapp' "$log_file"

: > "$log_file"
CLAWMAX_PLUGIN_TEST_LOG="$log_file" CLAWMAX_PLUGIN_INSPECT_EXIT=0 OPENCLAW_BIN="$fake_openclaw" bash "$script_file" >/dev/null
if grep -q 'plugins install' "$log_file"; then
  echo "FAIL: installed an already-discoverable WhatsApp plugin" >&2
  exit 1
fi
grep -Fxq 'plugins enable whatsapp' "$log_file"

echo "PASS: default OpenClaw plugins install compatibly and idempotently"
