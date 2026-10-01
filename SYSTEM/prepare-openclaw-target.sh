#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

. "$SCRIPT_DIR/openclaw-version.sh"
. "$SCRIPT_DIR/openclaw-cache-guard.sh"

PREPARED_WORK_ROOT=""

usage() {
  cat <<'EOF'
Usage: ./SYSTEM/prepare-openclaw-target.sh [--print-bin|--print-skills-dir]

Build the branch-targeted OpenClaw checkout in an isolated cache directory and
create a branch-local wrapper binary suitable for OPENCLAW_BIN.
EOF
}

ensure_supported_node() {
  node <<'EOF'
const [majorRaw = "0", minorRaw = "0", patchRaw = "0"] = process.versions.node.split(".");
const major = Number(majorRaw);
const minor = Number(minorRaw);
const patch = Number(patchRaw);
const atLeast = (wantedMinor, wantedPatch) =>
  minor > wantedMinor || (minor === wantedMinor && patch >= wantedPatch);
if (
  (major === 24 && atLeast(16, 0)) ||
  (major === 26 && atLeast(1, 0)) ||
  major > 26
) {
  process.exit(0);
}
console.error(
  `prepare-openclaw-target.sh requires Node.js 24.16.0+ (24.x) or 26.1.0+ (current: ${process.versions.node})`,
);
process.exit(1);
EOF
}

run_pnpm() {
  if command -v corepack >/dev/null 2>&1; then
    corepack pnpm "$@"
    return 0
  fi

  if command -v pnpm >/dev/null 2>&1; then
    pnpm "$@"
    return 0
  fi

  echo "pnpm or corepack is required to prepare OpenClaw ${CLAWMAX_OPENCLAW_TARGET}" >&2
  exit 1
}

ensure_pnpm_on_path() {
  local shim_dir="$1"

  if command -v corepack >/dev/null 2>&1; then
    mkdir -p "$shim_dir"
    cat >"${shim_dir}/pnpm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
exec corepack pnpm "$@"
EOF
    chmod +x "${shim_dir}/pnpm"
    export PATH="${shim_dir}:${PATH}"
    return 0
  fi

  if command -v pnpm >/dev/null 2>&1; then
    return 0
  fi

  echo "pnpm or corepack is required to prepare OpenClaw ${CLAWMAX_OPENCLAW_TARGET}" >&2
  exit 1
}

ensure_corepack_ready() {
  local work_root="$1"
  command -v corepack >/dev/null 2>&1 || return 0
  if corepack pnpm --version >&2; then
    return 0
  fi
  # A stale Corepack install marker can survive missing package files. Probe
  # before dependency installation and retry once in a fresh task-owned cache.
  # Preserve the old cache (including an explicitly configured shared cache).
  export COREPACK_HOME="$(mktemp -d "${work_root}/corepack-recovery.XXXXXX")"
  echo "pnpm startup failed; retrying with isolated Corepack cache $COREPACK_HOME" >&2
  if ! corepack pnpm --version >&2; then
    echo "Pinned pnpm is still unavailable; refusing to install or build OpenClaw." >&2
    return 1
  fi
}

sanitize_ref() {
  printf '%s' "$1" | tr '/:@' '---'
}

clone_target() {
  local work_root="$1" src_dir="$2" attempt staging
  for attempt in 1 2 3; do
    staging="$(mktemp -d "${work_root}/clone.XXXXXX")"
    echo "Cloning pinned OpenClaw ${CLAWMAX_OPENCLAW_TARGET} (attempt ${attempt}/3, HTTP/1.1)..." >&2
    # Command-local transport selection avoids HTTP/2 stream cancellation without
    # changing the user's global Git settings. Never clone into the usable cache.
    if git -c http.version=HTTP/1.1 clone --depth 1 --single-branch --branch "$CLAWMAX_OPENCLAW_TARGET" https://github.com/openclaw/openclaw.git "$staging/src" >&2; then
      if [ -e "$src_dir" ] || [ -L "$src_dir" ]; then
        echo "OpenClaw source cache appeared during clone; refusing to overwrite it. Retry preparation." >&2
        return 1
      fi
      mv "$staging/src" "$src_dir"
      rmdir "$staging"
      return 0
    fi
    # Keep failed transfer artifacts isolated for inspection; never mark ready.
    echo "OpenClaw clone failed; incomplete transfer retained at $staging" >&2
  done
  echo "Unable to clone pinned OpenClaw after 3 attempts; no fallback runtime was selected." >&2
  return 1
}

prepare_checkout() {
  local sanitized_ref cache_root work_root src_dir current_tag prepared_stamp current_commit
  sanitized_ref="$(sanitize_ref "$CLAWMAX_OPENCLAW_TARGET")"
  cache_root="${CLAWMAX_OPENCLAW_CACHE_DIR:-${TMPDIR:-/tmp}/clawmax-openclaw-targets}"
  work_root="${cache_root}/${sanitized_ref}"
  src_dir="${work_root}/src"
  prepared_stamp="${work_root}/.prepared-commit"

  mkdir -p "$work_root"
  work_root="$(cd "$work_root" && pwd -P)"
  src_dir="${work_root}/src"
  prepared_stamp="${work_root}/.prepared-commit"
  clawmax_cache_lock "$work_root"

  if [ -d "$src_dir" ] && [ ! -f "$src_dir/package.json" ]; then
    clawmax_cache_assert_idle "$work_root"
    rm -rf "$src_dir"
  fi

  if [ ! -d "$src_dir/.git" ]; then
    clone_target "$work_root" "$src_dir"
  fi

  current_tag="$(cd "$src_dir" && git describe --tags --exact-match HEAD 2>/dev/null || true)"
  if [ "$current_tag" != "$CLAWMAX_OPENCLAW_TARGET" ]; then
    clawmax_cache_assert_idle "$work_root"
    (
      cd "$src_dir"
      git fetch --depth 1 --tags --force origin "$CLAWMAX_OPENCLAW_TARGET" >&2
      git checkout --force "$CLAWMAX_OPENCLAW_TARGET" >&2
    )
  fi

  ensure_supported_node

  current_commit="$(
    cd "$src_dir"
    git rev-parse HEAD
  )"

  # Rebuild cached artifacts when the maintained source compatibility patch changes.
  current_commit="${current_commit}:$(cksum < "$SCRIPT_DIR/patch-openclaw-roster-removal.mjs")"
  current_commit="${current_commit}:$(cksum < "$SCRIPT_DIR/patch-openclaw-fs-safe.mjs")"
  current_commit="${current_commit}:source-plugins-v1:$(cksum < "$SCRIPT_DIR/verify-openclaw-plugin-entries.mjs")"
  if [ ! -f "${src_dir}/dist/index.js" ] || [ ! -f "$prepared_stamp" ] || [ "$(cat "$prepared_stamp" 2>/dev/null || true)" != "$current_commit" ] || ! node "$SCRIPT_DIR/verify-openclaw-plugin-entries.mjs" "$src_dir" >&2; then
    clawmax_cache_assert_idle "$work_root"
    (
      cd "$src_dir"
      export COREPACK_HOME="${COREPACK_HOME:-${work_root}/corepack}"
      ensure_corepack_ready "$work_root"
      ensure_pnpm_on_path "${work_root}/bin"
      run_pnpm install --frozen-lockfile --ignore-scripts >&2
      node "$SCRIPT_DIR/patch-openclaw-roster-removal.mjs" "$src_dir" >&2
      run_pnpm run build:docker >&2
      # The Docker lane omits standalone first-party plugin graphs. A local
      # source checkout must build them too, before advertising cache readiness.
      node --import ./scripts/tsx.mjs scripts/build-external-plugin-local-dist.mts >&2
      # Standalone compilation replaces plugin output directories. Restore the
      # package/manifests and assets afterward, matching upstream build-all.
      run_pnpm plugins:assets:copy >&2
      node scripts/runtime-postbuild.mjs >&2
      node "$SCRIPT_DIR/patch-openclaw-fs-safe.mjs" "$src_dir" >&2
      node scripts/postinstall-bundled-plugins.mjs >&2
      node "$SCRIPT_DIR/verify-openclaw-plugin-entries.mjs" "$src_dir" >&2
      node - dist/cli-startup-metadata.json <<'EOF'
const fs = require("node:fs");
const metadata = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const channels = new Set(metadata.channelOptions ?? []);
for (const channel of ["whatsapp", "discord", "telegram", "slack"]) {
  if (!channels.has(channel)) {
    throw new Error(`OpenClaw startup metadata is missing channel: ${channel}`);
  }
}
EOF
    )
    printf '%s\n' "$current_commit" > "$prepared_stamp"
  fi

  mkdir -p "${work_root}/bin"
  cat >"${work_root}/bin/openclaw" <<EOF
#!/usr/bin/env bash
set -euo pipefail
. "$SCRIPT_DIR/openclaw-cache-guard.sh"
clawmax_cache_lock "$work_root"
clawmax_cache_register_runtime "$work_root"
clawmax_cache_unlock
# Never inherit a removable cache/workspace as the process working directory.
cd /
export OPENCLAW_NO_RESPAWN=1
exec node "$src_dir/openclaw.mjs" "\$@"
EOF
  chmod +x "${work_root}/bin/openclaw"

  PREPARED_WORK_ROOT="$work_root"
  clawmax_cache_unlock
}

main() {
  local work_root
  case "${1:-}" in
    -h|--help)
      usage
      exit 0
      ;;
  esac

  prepare_checkout
  work_root="$PREPARED_WORK_ROOT"

  case "${1:-}" in
    --print-bin)
      printf '%s\n' "${work_root}/bin/openclaw"
      ;;
    --print-skills-dir)
      printf '%s\n' "${work_root}/src/skills"
      ;;
    "")
      printf 'Prepared OpenClaw %s\n' "$CLAWMAX_OPENCLAW_TARGET"
      printf 'OPENCLAW_BIN=%s\n' "${work_root}/bin/openclaw"
      printf 'OPENCLAW_SKILLS_DIR=%s\n' "${work_root}/src/skills"
      ;;
    *)
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
