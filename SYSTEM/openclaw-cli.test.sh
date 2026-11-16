#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/clawmax-runtime-reader.XXXXXX")"
trap 'rm -rf "$fixture_root"' EXIT
. "$repo_root/SYSTEM/openclaw-version.sh"
. "$repo_root/SYSTEM/openclaw-cli.sh"
mkdir -p "$fixture_root/bin" "$fixture_root/cache/$CLAWMAX_OPENCLAW_TARGET/bin" "$fixture_root/home"
cat > "$fixture_root/bin/openclaw" <<'EOF'
#!/bin/sh
echo 'unexpected global CLI invocation' >&2
exit 23
EOF
cached_cli="$fixture_root/cache/$CLAWMAX_OPENCLAW_TARGET/bin/openclaw"
cat > "$cached_cli" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >> "$CLAWMAX_RESOLVER_TEST_LOG"
case "$*" in
  'gateway status') [ "${CLAWMAX_RESOLVER_TEST_RUNNING:-}" = true ] ;;
  'gateway restart') exit 0 ;;
esac
EOF
chmod +x "$fixture_root/bin/openclaw" "$cached_cli"
export PATH="$fixture_root/bin:/usr/bin:/bin"
export CLAWMAX_OPENCLAW_CACHE_DIR="$fixture_root/cache"
unset OPENCLAW_BIN
printf 'verified-fixture\n' > "$fixture_root/cache/$CLAWMAX_OPENCLAW_TARGET/.prepared-commit"
[ "$(resolve_openclaw_cli)" = "$cached_cli" ] || { echo 'FAIL: prepared runtime must precede old global CLI' >&2; exit 1; }
OPENCLAW_BIN="$fixture_root/bin/openclaw" resolved="$(OPENCLAW_BIN="$fixture_root/bin/openclaw" resolve_openclaw_cli)"
[ "$resolved" = "$fixture_root/bin/openclaw" ] || exit 1
unset OPENCLAW_BIN
rm "$fixture_root/cache/$CLAWMAX_OPENCLAW_TARGET/.prepared-commit"
[ "$(resolve_openclaw_cli)" = "$fixture_root/bin/openclaw" ] || { echo 'FAIL: unverified cache must not be selected' >&2; exit 1; }
printf 'verified-fixture\n' > "$fixture_root/cache/$CLAWMAX_OPENCLAW_TARGET/.prepared-commit"
export CLAWMAX_RESOLVER_TEST_LOG="$fixture_root/cli.log"
HOME="$fixture_root/home" /bin/sh "$repo_root/SYSTEM/scripts/gateway-watchdog.sh"
grep -Fxq 'gateway restart' "$CLAWMAX_RESOLVER_TEST_LOG"
: > "$CLAWMAX_RESOLVER_TEST_LOG"
HOME="$fixture_root/home" CLAWMAX_RESOLVER_TEST_RUNNING=true /bin/sh "$repo_root/SYSTEM/scripts/gateway-watchdog.sh"
if grep -q 'gateway restart' "$CLAWMAX_RESOLVER_TEST_LOG"; then exit 1; fi
echo 'PASS: prepared runtime resolution, explicit override, unverified cache fallback and watchdog restart scope'
