#!/usr/bin/env bash
# Source after openclaw-cli.sh and openclaw-version.sh. Shared setup/start contract.
CLAWMAX_OPENCLAW_RUNTIME_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ensure_pinned_openclaw_for_dev() {
  if [ "${CLAWMAX_ALLOW_UNPINNED_OPENCLAW:-}" = "true" ]; then
    return 0
  fi

  local expected_version="${CLAWMAX_OPENCLAW_TARGET#v}"
  local selected_bin="${OPENCLAW_BIN:-}"
  local version_output=""
  if [ -z "$selected_bin" ]; then
    selected_bin="$(resolve_openclaw_cli 2>/dev/null || true)"
  fi
  if [ -n "$selected_bin" ] && [ -x "$selected_bin" ]; then
    version_output="$("$selected_bin" --version 2>&1 || true)"
  fi

  if [[ "$version_output" != *"$expected_version"* ]]; then
    if [ -n "$version_output" ]; then
      echo "↻ Installed OpenClaw does not match ${CLAWMAX_OPENCLAW_TARGET}: $version_output"
    else
      echo "↻ OpenClaw is unavailable; preparing ${CLAWMAX_OPENCLAW_TARGET}..."
    fi
    echo "↻ Preparing pinned OpenClaw ${CLAWMAX_OPENCLAW_TARGET} for local development..."
    selected_bin="$(bash "$CLAWMAX_OPENCLAW_RUNTIME_DIR/prepare-openclaw-target.sh" --print-bin)" || return 1
    version_output="$("$selected_bin" --version 2>&1 || true)"
  fi

  if [[ "$version_output" != *"$expected_version"* ]]; then
    echo "Local development requires OpenClaw ${CLAWMAX_OPENCLAW_TARGET}; selected binary reports: ${version_output:-unavailable}" >&2
    return 1
  fi

  export OPENCLAW_BIN="$selected_bin"
  local prepared_package_root
  prepared_package_root="$(cd "$(dirname "$selected_bin")/../src" 2>/dev/null && pwd || true)"
  if [ -f "$prepared_package_root/package.json" ]; then
    export OPENCLAW_PACKAGE_ROOT="$prepared_package_root"
  else
    local real_bin package_root
    real_bin="$(node -e 'const fs=require("fs"); process.stdout.write(fs.realpathSync(process.argv[1]))' "$selected_bin" 2>/dev/null || true)"
    package_root="$(dirname "$real_bin" 2>/dev/null || true)"
    if [ -f "$package_root/package.json" ]; then
      export OPENCLAW_PACKAGE_ROOT="$package_root"
    fi
  fi
  echo "✓ Using pinned OpenClaw: $version_output"
}

