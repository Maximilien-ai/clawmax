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
if [ "${1:-}" = config ] && [ "${2:-}" = validate ]; then
  exit "${CLAWMAX_PLUGIN_CONFIG_EXIT:-0}"
fi
if [ "${1:-}" = plugins ] && [ "${3:-}" = --help ]; then
  if [ "${CLAWMAX_PLUGIN_LEGACY_HELP:-}" != true ]; then printf '%s\n' '--accept-capabilities'; fi
  exit 0
fi
if [ "${1:-}" = plugins ] && [ "${2:-}" = inspect ]; then
  exit "${CLAWMAX_PLUGIN_INSPECT_EXIT:-1}"
fi
if [ "${1:-}" = --version ]; then
  printf '%s\n' 'OpenClaw 2026.5.26 (test)'
fi
EOF
chmod +x "$fake_openclaw"

CLAWMAX_PLUGIN_TEST_LOG="$log_file" OPENCLAW_BIN="$fake_openclaw" bash "$script_file" >/dev/null
grep -Fxq 'plugins install npm:@openclaw/whatsapp@2026.5.26 --accept-capabilities' "$log_file"
grep -Fxq 'plugins enable whatsapp --accept-capabilities' "$log_file"
grep -Fxq 'plugins install npm:@openclaw/discord@2026.5.26 --accept-capabilities' "$log_file"
grep -Fxq 'plugins enable discord --accept-capabilities' "$log_file"
grep -Fxq 'plugins install npm:@openclaw/slack@2026.5.26 --accept-capabilities' "$log_file"
grep -Fxq 'plugins enable slack --accept-capabilities' "$log_file"

: > "$log_file"
if CLAWMAX_PLUGIN_TEST_LOG="$log_file" CLAWMAX_PLUGIN_LEGACY_HELP=true OPENCLAW_BIN="$fake_openclaw" bash "$script_file" > "$tmp_dir/legacy-output" 2>&1; then
  echo 'FAIL: unsupported capability consent must fail before plugin changes' >&2
  exit 1
fi
grep -q 'branch-pinned runtime' "$tmp_dir/legacy-output"
if grep -E '^plugins (install|enable) ' "$log_file" | grep -v -- '--help'; then
  echo 'FAIL: unsupported CLI must not mutate plugin configuration' >&2
  exit 1
fi

: > "$log_file"
CLAWMAX_PLUGIN_TEST_LOG="$log_file" CLAWMAX_PLUGIN_INSPECT_EXIT=0 OPENCLAW_BIN="$fake_openclaw" bash "$script_file" >/dev/null
if grep -q '^plugins install npm:' "$log_file"; then
  echo "FAIL: installed an already-discoverable WhatsApp plugin" >&2
  exit 1
fi
grep -Fxq 'plugins enable whatsapp --accept-capabilities' "$log_file"
grep -Fxq 'plugins enable discord --accept-capabilities' "$log_file"
grep -Fxq 'plugins enable slack --accept-capabilities' "$log_file"

: > "$log_file"
printf '{}\n' > "$tmp_dir/invalid.json"
if OPENCLAW_CONFIG_PATH="$tmp_dir/invalid.json" CLAWMAX_PLUGIN_TEST_LOG="$log_file" CLAWMAX_PLUGIN_CONFIG_EXIT=1 OPENCLAW_BIN="$fake_openclaw" bash "$script_file" > "$tmp_dir/config-output" 2>&1; then
  echo 'FAIL: invalid config must stop setup' >&2
  exit 1
fi
grep -q './SYSTEM/local-dev.sh' "$tmp_dir/config-output"
if grep -Eq '^(plugins|doctor|gateway) ' "$log_file"; then
  echo 'FAIL: invalid config must not trigger plugins, repair or service management' >&2
  exit 1
fi
echo "PASS: default OpenClaw plugins install compatibly and idempotently"
